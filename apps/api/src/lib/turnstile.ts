/** Xác minh Cloudflare Turnstile (02 §8). Không cấu hình secret → không qua được (dev chỉ dùng giới hạn tần suất). */
export const verifyTurnstile = async (secret: string | null, token: unknown, ip?: string): Promise<boolean> => {
  if (!secret || typeof token !== 'string' || !token) return false
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) })
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(5000) })
    return ((await r.json()) as { success?: boolean }).success === true
  } catch {
    return false
  }
}
