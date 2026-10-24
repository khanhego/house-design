/** Đếm theo cửa sổ trượt trong bộ nhớ tiến trình (ADR-002: một server). */
export const slidingWindow = (limit: number, windowMs: number) => {
  const hits = new Map<string, number[]>()
  return {
    /** Ghi một lần và trả true nếu vẫn trong giới hạn. */
    hit(key: string, now = Date.now()) {
      const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      arr.push(now)
      hits.set(key, arr)
      if (hits.size > 50_000) for (const k of [...hits.keys()].slice(0, 10_000)) hits.delete(k)
      return arr.length <= limit
    },
    peek(key: string, now = Date.now()) {
      return (hits.get(key) ?? []).filter((t) => now - t < windowMs).length
    },
    reset: () => hits.clear(),
  }
}
