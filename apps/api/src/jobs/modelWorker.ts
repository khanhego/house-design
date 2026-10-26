import { parentPort, workerData } from 'node:worker_threads'
import type { ModelNormalize } from '../repos/types.ts'
import { optimizeGlb, optimizeItem } from './modelOptimize.ts'

/** Entry của worker thread (R-08): không chặn luồng API. `item` = mô hình đồ thư viện (item 03 lát R2). */
const d = workerData as { input: string; output: string; ext?: string; item?: { lightOutput: string; normalize: ModelNormalize } }
const run = d.item ? optimizeItem(d.input, d.output, d.item.lightOutput, d.ext ?? 'glb', d.item.normalize) : optimizeGlb(d.input, d.output, d.ext)
run
  .then((r) => parentPort!.postMessage({ ok: true, ...r }))
  .catch((e: Error) => parentPort!.postMessage({ ok: false, error: e.message }))
