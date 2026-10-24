import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'

/** Ranh giới lưu file (ADR-002): đĩa local ở Phase 1, đổi sang S3 sau mà không đổi service. */
export interface Storage {
  newKey(prefix: string, originalName: string): string
  putStream(key: string, src: Readable, maxBytes: number): Promise<number>
  putBuffer(key: string, buf: Buffer | Uint8Array): Promise<number>
  stream(key: string): Readable
  path(key: string): string
  size(key: string): number
  exists(key: string): boolean
  remove(key: string): Promise<void>
}

export class FileTooLargeError extends Error {}

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80) || 'file'

export const localDiskStorage = (root: string): Storage => {
  mkdirSync(root, { recursive: true })
  const full = (key: string) => {
    const p = normalize(join(root, key))
    if (!p.startsWith(normalize(root))) throw new Error('invalid key')
    return p
  }
  return {
    newKey: (prefix, originalName) => `${prefix}/${randomBytes(16).toString('hex')}/${safeName(originalName)}`,
    async putStream(key, src, maxBytes) {
      const p = full(key)
      mkdirSync(dirname(p), { recursive: true })
      const tmp = `${p}.part`
      let bytes = 0
      src.on('data', (c: Buffer) => {
        bytes += c.length
        if (bytes > maxBytes) src.destroy(new FileTooLargeError('too large'))
      })
      try {
        await pipeline(src, createWriteStream(tmp))
      } catch (e) {
        await unlink(tmp).catch(() => {})
        throw e
      }
      // @fastify/multipart cắt ngầm khi vượt giới hạn → kiểm cờ truncated
      if ((src as Readable & { truncated?: boolean }).truncated) {
        await unlink(tmp).catch(() => {})
        throw new FileTooLargeError('too large')
      }
      await rename(tmp, p)
      return bytes
    },
    async putBuffer(key, buf) {
      const p = full(key)
      mkdirSync(dirname(p), { recursive: true })
      await writeFile(p, buf)
      return buf.byteLength
    },
    stream: (key) => createReadStream(full(key)),
    path: full,
    size: (key) => statSync(full(key)).size,
    exists: (key) => existsSync(full(key)),
    remove: async (key) => unlink(full(key)).catch(() => {}),
  }
}
