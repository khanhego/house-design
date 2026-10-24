import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { BUDGET, levelOf } from '@hd/core'
import type { ModelReport } from '@hd/core'
import type { Ctx } from '../context.ts'
import { enqueueJob } from './runner.ts'
import type { JobHandler } from './runner.ts'

const TIMEOUT_MS = 5 * 60_000

export const runWorker = (input: string, output: string, timeoutMs = TIMEOUT_MS) =>
  new Promise<{ ok: boolean; report?: ModelReport; warnings?: string[]; error?: string }>((resolve) => {
    const w = new Worker(join(import.meta.dirname, 'modelWorker.ts'), { workerData: { input, output } })
    const timer = setTimeout(() => {
      void w.terminate()
      resolve({ ok: false, error: 'Xử lý mô hình quá 5 phút. Hãy giảm chi tiết hoặc chia nhỏ tệp rồi tải lại.' })
    }, timeoutMs)
    w.once('message', (m) => (clearTimeout(timer), void w.terminate(), resolve(m)))
    w.once('error', (e: Error) => (clearTimeout(timer), resolve({ ok: false, error: `Không xử lý được mô hình: ${e.message}` })))
  })

/** Job `model.optimize` (02a §7): mức của riêng mô hình để tham khảo; chặn gửi duyệt tính ở submitChecks. */
export const modelOptimizeHandler: JobHandler = async (ctx: Ctx, payload) => {
  const id = payload.modelAssetId as string
  const m = ctx.repos.models.get(id)
  if (!m || m.status !== 'processing') return
  const orig = ctx.repos.files.get(m.originalFileId)!
  const key = ctx.storage.newKey('model_optimized', orig.originalName.replace(/\.(glb|gltf)$/i, '') + '.glb')
  const out = ctx.storage.path(key)
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(out, '..'), { recursive: true })
  const r = await runWorker(ctx.storage.path(orig.storageKey), out)
  if (!r.ok || !r.report) {
    ctx.repos.models.finish(id, { status: 'failed', error: r.error ?? 'Không xử lý được mô hình' })
    return
  }
  const f = ctx.repos.files.create({ projectId: m.projectId, kind: 'model_optimized', originalName: orig.originalName.replace(/\.(glb|gltf)$/i, '') + '.glb', mime: 'model/gltf-binary', bytes: r.report.fileBytes, storageKey: key, uploadedBy: m.createdBy })
  const { level, reasons } = levelOf(r.report)
  ctx.repos.models.finish(id, { status: 'ready', optimizedFileId: f.id, report: r.report, level, reasons: [...reasons, ...(r.warnings ?? [])] })
}

export const enqueueModel = (ctx: Ctx, modelAssetId: string) => enqueueJob(ctx, 'model', 'model.optimize', { modelAssetId })
export { BUDGET }
