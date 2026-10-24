import { createHmac, timingSafeEqual } from 'node:crypto'

/** Form token ký HMAC chứa thời điểm phát (02 §8 chống bot): hợp lệ khi ≥ 3 giây và ≤ 2 giờ. */
export const formTokens = (secret: string) => {
  const sign = (ts: string) => createHmac('sha256', secret).update(ts).digest('base64url').slice(0, 32)
  return {
    issue: (now = Date.now()) => `ft_${now.toString(36)}.${sign(now.toString(36))}`,
    verify(token: unknown, now = Date.now(), minMs = 3000, maxMs = 2 * 3600 * 1000): boolean {
      if (typeof token !== 'string' || !token.startsWith('ft_')) return false
      const [ts, sig] = token.slice(3).split('.')
      if (!ts || !sig) return false
      const expect = Buffer.from(sign(ts))
      const got = Buffer.from(sig)
      if (expect.length !== got.length || !timingSafeEqual(expect, got)) return false
      const age = now - parseInt(ts, 36)
      return age >= minMs && age <= maxMs
    },
  }
}
