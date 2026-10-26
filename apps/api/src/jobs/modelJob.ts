import { Worker } from 'node:worker_threads'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BUDGET, itemLevel, levelOf } from '@hd/core'
import type { ModelReport } from '@hd/core'
import type { Ctx } from '../context.ts'
import type { ModelNormalize } from '../repos/types.ts'
import { enqueueJob } from './runner.ts'
import type { JobHandler } from './runner.ts'
import type { ItemResult } from './modelOptimize.ts'

const TIMEOUT_MS = 5 * 60_000

type WorkerOut = { ok: boolean; report?: ModelReport; warnings?: string[]; error?: string } & Partial<Omit<ItemResult, 'report' | 'warnings'>>

export const runWorker = (input: string, output: string, timeoutMs = TIMEOUT_MS, opts: { ext?: string; item?: { lightOutput: string; normalize: ModelNormalize } } = {}) =>
  new Promise<WorkerOut>((resolve) => {
    const w = new Worker(join(import.meta.dirname, 'modelWorker.ts'), { workerData: { input, output, ...opts } })
    const timer = setTimeout(() => {
      void w.terminate()
      resolve({ ok: false, error: 'Xử lý mô hình quá 5 phút. Hãy giảm chi tiết hoặc chia nhỏ tệp rồi tải lại.' })
    }, timeoutMs)
    w.once('message', (m) => (clearTimeout(timer), void w.terminate(), resolve(m)))
    w.once('error', (e: Error) => (clearTimeout(timer), resolve({ ok: false, error: `Không xử lý được mô hình: ${e.message}` })))
  })

export const DEFAULT_NORMALIZE: ModelNormalize = { unit: 'auto', upAxis: 'auto', declaredMm: null }

const baseName = (name: string) => name.replace(/\.(glb|gltf|fbx|obj|zip)$/i, '')
const extOf = (name: string) => (name.split('.').pop() ?? 'glb').toLowerCase()

/**
 * Job `model.optimize` (02a §7): mức của riêng mô hình để tham khảo; chặn gửi duyệt tính ở submitChecks.
 * Mô hình thư viện (không thuộc dự án) đi đường đồ chân thực (item 03 lát R2): chuẩn hoá + bản đầy đủ + bản nhẹ,
 * vượt mức Chặn của món (BR-R2) → failed.
 */
export const modelOptimizeHandler: JobHandler = async (ctx: Ctx, payload) => {
  const id = payload.modelAssetId as string
  const m = ctx.repos.models.get(id)
  if (!m || m.status !== 'processing') return
  const orig = ctx.repos.files.get(m.originalFileId)!
  const name = baseName(orig.originalName)
  const key = ctx.storage.newKey('model_optimized', name + '.glb')
  const out = ctx.storage.path(key)
  mkdirSync(dirname(out), { recursive: true })
  const ext = extOf(orig.originalName)
  const isItem = m.projectId === null
  const lightKey = isItem ? ctx.storage.newKey('model_optimized', name + '-nhe.glb') : null
  if (lightKey) mkdirSync(dirname(ctx.storage.path(lightKey)), { recursive: true })
  const normalize = m.normalize ?? DEFAULT_NORMALIZE
  const r = await runWorker(ctx.storage.path(orig.storageKey), out, TIMEOUT_MS, {
    ext,
    item: lightKey ? { lightOutput: ctx.storage.path(lightKey), normalize: { unit: normalize.unit, upAxis: normalize.upAxis, declaredMm: normalize.declaredMm } } : undefined,
  })
  const drop = () => {
    void ctx.storage.remove(key).catch(() => {})
    if (lightKey) void ctx.storage.remove(lightKey).catch(() => {})
  }
  if (!r.ok || !r.report) {
    drop()
    ctx.repos.models.finish(id, { status: 'failed', error: r.error ?? 'Không xử lý được mô hình' })
    return
  }
  if (isItem && r.lightReport && r.normalize) {
    const full = itemLevel(r.report, 'full')
    const light = itemLevel(r.lightReport, 'light')
    const reasons = [...full.reasons, ...light.reasons]
    if (full.level === 'block' || light.level === 'block') {
      drop()
      ctx.repos.models.finish(id, {
        status: 'failed',
        error: `Mô hình quá nặng sau khi đã tự giảm (${reasons.join('; ')}). Hãy giảm chi tiết (bỏ ốc vít, mặt khuất, chia nhỏ mô hình) hoặc dùng bản ít đa giác hơn rồi tải lại.`,
        report: r.report, lightReport: r.lightReport, normalize: { ...normalize, result: r.normalize },
      })
      return
    }
    const f = ctx.repos.files.create({ projectId: null, kind: 'model_optimized', originalName: name + '.glb', mime: 'model/gltf-binary', bytes: r.report.fileBytes, storageKey: key, uploadedBy: m.createdBy })
    const lf = ctx.repos.files.create({ projectId: null, kind: 'model_optimized', originalName: name + '-nhe.glb', mime: 'model/gltf-binary', bytes: r.lightReport.fileBytes, storageKey: lightKey!, uploadedBy: m.createdBy })
    ctx.repos.models.finish(id, {
      status: 'ready', optimizedFileId: f.id, report: r.report, lightFileId: lf.id, lightReport: r.lightReport,
      level: full.level === 'warn' || light.level === 'warn' ? 'warn' : 'ok', reasons: [...reasons, ...r.normalize.notes, ...(r.warnings ?? [])],
      normalize: { ...normalize, result: r.normalize },
    })
    return
  }
  const f = ctx.repos.files.create({ projectId: m.projectId, kind: 'model_optimized', originalName: name + '.glb', mime: 'model/gltf-binary', bytes: r.report.fileBytes, storageKey: key, uploadedBy: m.createdBy })
  const { level, reasons } = levelOf(r.report)
  ctx.repos.models.finish(id, { status: 'ready', optimizedFileId: f.id, report: r.report, level, reasons: [...reasons, ...(r.warnings ?? [])] })
}

export const enqueueModel = (ctx: Ctx, modelAssetId: string) => enqueueJob(ctx, 'model', 'model.optimize', { modelAssetId })
export { BUDGET }
