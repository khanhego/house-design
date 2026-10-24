import type { Point } from '@hd/core'

/** Tài liệu dùng mm, mặt bằng (x, y). Cảnh 3D dùng mét: X = x/1000, Z = y/1000, Y = cao độ/1000. */
export const M = (mm: number) => mm / 1000
export const toXZ = (p: Point): [number, number] => [p[0] / 1000, p[1] / 1000]
export const deg = (d: number) => (d * Math.PI) / 180
