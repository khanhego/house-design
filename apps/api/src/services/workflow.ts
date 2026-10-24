import { hasBlocking, submitChecks } from '@hd/core'
import type { HouseDocument, VersionState } from '@hd/core'
import { AppError, invalidState, notFound, validation } from '../lib/errors.ts'
import type { Review, Version } from '../repos/types.ts'
import type { Ctx } from '../context.ts'
import type { AuthUser } from './access.ts'
import { buildSnapshot, checkContext } from './snapshot.ts'
import { enqueueEmail } from './mail.ts'

/** Workflow phiên bản (SRS §7, 02 §5.4, 02a §4 API-50…55). Mọi chuyển trạng thái có điều kiện trong transaction. */

const load = (ctx: Ctx, versionId: string) => {
  const v = ctx.repos.versions.get(versionId)
  if (!v) throw notFound('Không tìm thấy phiên bản')
  const house = ctx.repos.houses.get(v.houseId)!
  const project = ctx.repos.projects.get(house.projectId)!
  return { v, house, project }
}

const mustBe = (v: Version, states: VersionState[]) => {
  if (!states.includes(v.state)) throw invalidState(v.state)
}

export const checksFor = (ctx: Ctx, v: Version) => {
  const doc = JSON.parse(v.document) as HouseDocument
  return submitChecks(doc, checkContext(ctx, doc))
}

export const submit = (ctx: Ctx, versionId: string, user: AuthUser) => {
  const { v, house, project } = load(ctx, versionId)
  mustBe(v, ['draft'])
  const checks = checksFor(ctx, v)
  if (hasBlocking(checks)) throw new AppError(422, 'SUBMIT_BLOCKED', 'Chưa đủ điều kiện gửi duyệt', { extra: { checks } })
  const sub = ctx.db.tx(() => {
    const { snapshot, storageKeys, hash } = buildSnapshot(ctx, v.document, house)
    const s = ctx.repos.submissions.create(v.id, JSON.stringify(snapshot), hash, user.id, storageKeys)
    if (!ctx.repos.versions.transition(v.id, ['draft'], 'pending_review', { currentSubmissionId: s.id })) throw invalidState(ctx.repos.versions.get(v.id)!.state)
    return s
  })
  for (const a of ctx.repos.users.activeApprovers(project.clientId)) {
    enqueueEmail(ctx, a.email, 'E3', { name: a.name, houseName: house.name, versionNumber: v.number, versionId: v.id, projectName: project.name })
  }
  return { version: ctx.repos.versions.get(v.id)!, submission: sub }
}

export const withdraw = (ctx: Ctx, versionId: string, user: AuthUser) => {
  const { v } = load(ctx, versionId)
  mustBe(v, ['pending_review'])
  return ctx.db.tx(() => {
    if (!ctx.repos.versions.transition(v.id, ['pending_review'], 'draft')) throw invalidState(ctx.repos.versions.get(v.id)!.state)
    if (v.currentSubmissionId) ctx.repos.submissions.withdraw(v.currentSubmissionId, user.id)
    return { version: ctx.repos.versions.get(v.id)!, submission: v.currentSubmissionId ? ctx.repos.submissions.get(v.currentSubmissionId)! : null }
  })
}

export interface ReviewInput {
  decision: Review['decision']
  note?: string | null
  targets?: Review['targets']
}

export const review = (ctx: Ctx, versionId: string, user: AuthUser, input: ReviewInput, onBehalf?: { evidenceFileId: string | null }) => {
  const { v } = load(ctx, versionId)
  mustBe(v, ['pending_review'])
  const note = input.note?.trim() ?? ''
  if ((input.decision === 'changes_requested' || onBehalf) && note.length < 10)
    throw validation({ note: 'Ghi chú cần ít nhất 10 ký tự' })
  const subId = v.currentSubmissionId
  if (!subId) throw invalidState(v.state)
  return ctx.db.tx(() => {
    const sub = ctx.repos.submissions.get(subId)!
    let r: Review
    try {
      r = ctx.repos.reviews.create({
        submissionId: sub.id,
        versionId: v.id,
        decision: input.decision,
        note: note || null,
        targets: input.targets ?? [],
        userId: user.id,
        onBehalf: !!onBehalf,
        evidenceFileId: onBehalf?.evidenceFileId ?? null,
        snapshotHash: sub.snapshotHash,
      })
    } catch {
      throw invalidState(ctx.repos.versions.get(v.id)!.state)
    }
    const to: VersionState = input.decision === 'approved' ? 'approved' : 'draft'
    if (!ctx.repos.versions.transition(v.id, ['pending_review'], to)) throw invalidState(ctx.repos.versions.get(v.id)!.state)
    return { review: r, version: ctx.repos.versions.get(v.id)! }
  })
}

export const publish = (ctx: Ctx, versionId: string, user: AuthUser) => {
  const { v, house, project } = load(ctx, versionId)
  mustBe(v, ['approved', 'superseded', 'unpublished'])
  const subId = v.currentSubmissionId
  const approved = subId ? ctx.repos.reviews.forSubmission(subId) : undefined
  if (!subId || approved?.decision !== 'approved') throw invalidState(v.state)
  return ctx.db.tx(() => {
    let previous: Version | null = null
    if (house.publishedVersionId && house.publishedVersionId !== v.id) {
      ctx.repos.versions.transition(house.publishedVersionId, ['published'], 'superseded')
      previous = ctx.repos.versions.get(house.publishedVersionId) ?? null
    }
    const now = new Date().toISOString()
    if (!ctx.repos.versions.transition(v.id, ['approved', 'superseded', 'unpublished'], 'published', { publishedAt: now, publishedBy: user.id }))
      throw invalidState(ctx.repos.versions.get(v.id)!.state)
    ctx.repos.houses.update(house.id, { publishedVersionId: v.id, slugLocked: true })
    if (!project.slugLocked) ctx.repos.projects.update(project.id, { slugLocked: true })
    return { house: ctx.repos.houses.get(house.id)!, version: ctx.repos.versions.get(v.id)!, previous }
  })
}

export const unpublish = (ctx: Ctx, houseId: string) => {
  const house = ctx.repos.houses.get(houseId)
  if (!house) throw notFound('Không tìm thấy mẫu nhà')
  if (!house.publishedVersionId) throw invalidState('none')
  return ctx.db.tx(() => {
    const vid = house.publishedVersionId!
    if (!ctx.repos.versions.transition(vid, ['published'], 'unpublished')) throw invalidState(ctx.repos.versions.get(vid)!.state)
    ctx.repos.houses.update(house.id, { publishedVersionId: null })
    return { house: ctx.repos.houses.get(house.id)!, version: ctx.repos.versions.get(vid)! }
  })
}

export const newVersion = (ctx: Ctx, houseId: string) => {
  const house = ctx.repos.houses.get(houseId)
  if (!house) throw notFound('Không tìm thấy mẫu nhà')
  if (ctx.repos.versions.open(houseId)) throw new AppError(409, 'DRAFT_EXISTS', 'Mẫu nhà đang có phiên bản chưa phát hành', { extra: { versionId: ctx.repos.versions.open(houseId)!.id } })
  const latest = ctx.repos.versions.latest(houseId)!
  try {
    return ctx.repos.versions.create(houseId, latest.number + 1, JSON.parse(latest.document))
  } catch {
    throw new AppError(409, 'DRAFT_EXISTS', 'Mẫu nhà đang có phiên bản chưa phát hành')
  }
}
