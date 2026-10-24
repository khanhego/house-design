import { parentPort, workerData } from 'node:worker_threads'
import { optimizeGlb } from './modelOptimize.ts'

/** Entry của worker thread (R-08): không chặn luồng API. */
const { input, output } = workerData as { input: string; output: string }
optimizeGlb(input, output)
  .then((r) => parentPort!.postMessage({ ok: true, ...r }))
  .catch((e: Error) => parentPort!.postMessage({ ok: false, error: e.message }))
