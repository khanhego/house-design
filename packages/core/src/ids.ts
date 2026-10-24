const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** Id ngẫu nhiên dạng `<prefix>_<16 ký tự>` (~80 bit), chạy được trên Node và trình duyệt. */
export const newId = (prefix: string, size = 16) => {
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return `${prefix}_${out}`
}
