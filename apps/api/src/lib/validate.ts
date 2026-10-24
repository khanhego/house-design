import type { z } from 'zod'
import { validation } from './errors.ts'

/** Parse bằng zod; lỗi → 400 VALIDATION_ERROR với fields theo đường dẫn. */
export const parse = <S extends z.ZodType>(schema: S, data: unknown): z.infer<S> => {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  const fields: Record<string, string> = {}
  for (const i of r.error.issues) {
    const key = i.path.join('.') || '_'
    if (!fields[key]) fields[key] = i.message
  }
  throw validation(fields)
}
