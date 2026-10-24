import { describe, expect, it, beforeAll } from 'vitest'
import { obstaclesOf, pointInPolygon, sortedFloors, stairEnd, stairLayout, standable } from '@hd/core'
import type { HouseDocument, NavLibrary } from '@hd/core'
import { loadPhysics, Walker } from '../src/scene/physics/walker.ts'
import { doorsOf, rng, roomSpot, slabOf, walkPath, walkStraight } from './walkSim.ts'
import { LIBRARY, demoHouses } from '../../api/src/seed/demoHouses.ts'

/*
 * Người mẫu đi bộ bằng bộ vật lý — kiểm trên 4 nhà mẫu, không cần trình duyệt:
 * đi qua mọi phòng (navmesh), đi phím qua mọi cửa (đi chéo lệch tâm), leo mọi cầu thang bằng phím (lên + xuống),
 * tìm đường lên từng phòng tầng trên, đi lung tung không rời sàn, camera không lọt ra sau tường.
 */

const ids = Object.fromEntries(LIBRARY.map((l) => [l.key, `lib_${l.key}`]))
const sizes = Object.fromEntries(LIBRARY.map((l) => [l.key, l.sizeMm]))
const lib: NavLibrary = Object.fromEntries(LIBRARY.map((l) => [`lib_${l.key}`, { category: l.category, sizeMm: l.sizeMm }]))
const houses = demoHouses(ids as never, sizes as never)
const DT = 1 / 60

beforeAll(async () => {
  await loadPhysics()
})

const steer = (w: Walker, pts: { x: number; z: number }[]) => {
  for (const q of pts)
    for (let t = 0; t < 8; t += DT) {
      const p = w.pos
      const dx = q.x - p.x
      const dz = q.z - p.z
      const d = Math.hypot(dx, dz)
      if (d < 0.1) break
      w.move({ x: (dx / d) * 1.4, z: (dz / d) * 1.4 }, DT)
    }
}

for (const h of houses) {
  const doc: HouseDocument = h.document
  const floors = sortedFloors(doc)
  describe(`đi bộ vật lý — ${h.slug}`, () => {
    it('đi qua mọi phòng của từng tầng bằng "bấm sàn để đi tới"', () => {
      const w = new Walker(doc, lib)
      const bad: string[] = []
      for (const f of floors) {
        const spots = f.rooms.map((r) => ({ r, s: roomSpot(f, lib, r.polygon) }))
        const first = spots.find((x) => x.s)
        if (!first) continue
        w.teleport(first.s!)
        for (const { r, s } of [...spots.slice(1), spots[0]]) {
          if (!s) continue
          const res = walkPath(w, s)
          if (!res.ok) bad.push(`${f.name} → ${r.name}: cách ${res.gap.toFixed(2)} m`)
        }
      }
      w.dispose()
      expect(bad).toEqual([])
    }, 120_000)

    it('đi phím qua mọi cửa, từ hai phía, đi chéo lệch tâm', () => {
      const w = new Walker(doc, lib, { navMesh: false })
      const bad: string[] = []
      let tries = 0
      for (const d of doorsOf(doc)) {
        const obs = obstaclesOf(d.floor, lib)
        for (const side of [1, -1])
          for (const [lat, ang] of [[0.6, 15], [-0.6, -15], [0, 0]]) {
            const off = lat * Math.max(0, d.width / 2 - 0.2)
            const st = { x: d.c[0] - d.n[0] * side * 1.3 + d.u[0] * off, z: d.c[1] - d.n[1] * side * 1.3 + d.u[1] * off }
            const end = { x: d.c[0] + d.n[0] * side * 1.3, z: d.c[1] + d.n[1] * side * 1.3 }
            if (!standable([st.x * 1000, st.z * 1000], obs) || !standable([end.x * 1000, end.z * 1000], obs)) continue
            const y = d.floor.elevation / 1000
            w.teleport({ x: st.x, y, z: st.z })
            for (let k = 0; k < 10; k++) w.move({ x: 0, z: 0 }, DT)
            if (Math.abs(w.pos.y - y) > 0.1) continue
            tries++
            const a0 = Math.atan2(end.z - st.z, end.x - st.x) + (ang * Math.PI) / 180
            walkStraight(w, { x: Math.cos(a0), z: Math.sin(a0) }, 2.2)
            const along = (w.pos.x - d.c[0]) * d.n[0] * side + (w.pos.z - d.c[1]) * d.n[1] * side
            if (along < 0.3) bad.push(`${d.label} lệch ${off.toFixed(2)} góc ${ang}°: tới ${along.toFixed(2)} m`)
          }
      }
      w.dispose()
      expect(tries).toBeGreaterThan(10)
      expect(bad).toEqual([])
    }, 120_000)

    const stairs = floors.flatMap((f) => f.stairs.filter((s) => s.toFloorId).map((s) => ({ f, s, to: floors.find((x) => x.id === s.toFloorId)! })))
    if (stairs.length)
      it('leo mọi cầu thang bằng phím (lên rồi xuống), tìm đường lên từng phòng tầng trên', () => {
        const w = new Walker(doc, lib)
        const bad: string[] = []
        for (const { f, s, to } of stairs) {
          const L = stairLayout(s, 1)
          const P = (p: number[]) => ({ x: p[0] / 1000, z: p[1] / 1000 })
          const lc = L.landing ? L.landing.polygon.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4], [0, 0]) : null
          const b = stairEnd(s, 'bottom')
          const up = [P(L.flights[0].from), P(L.flights[0].to), ...(lc ? [P(lc)] : []), ...L.flights.slice(1).flatMap((fl) => [P(fl.from), P(fl.to)]), P(stairEnd(s, 'top'))]
          w.teleport({ x: b[0] / 1000, y: f.elevation / 1000, z: b[1] / 1000 })
          steer(w, up)
          if (Math.abs(w.pos.y - to.elevation / 1000) > 0.1) bad.push(`lên ${f.name} → ${to.name}: dừng ở y=${w.pos.y.toFixed(2)}`)
          steer(w, [...up].reverse().slice(1).concat([P(b)]))
          if (Math.abs(w.pos.y - f.elevation / 1000) > 0.1) bad.push(`xuống ${to.name} → ${f.name}: dừng ở y=${w.pos.y.toFixed(2)}`)
          for (const r of to.rooms) {
            const tgt = roomSpot(to, lib, r.polygon)
            if (!tgt) continue
            w.teleport({ x: b[0] / 1000, y: f.elevation / 1000, z: b[1] / 1000 })
            const res = walkPath(w, tgt, 90)
            if (!res.ok) bad.push(`tìm đường ${f.name} → ${to.name} · ${r.name}: cách ${res.gap.toFixed(2)} m`)
          }
        }
        w.dispose()
        expect(bad).toEqual([])
      }, 180_000)

    it('đi lung tung (chạy, đổi hướng ngẫu nhiên): không rời sàn, không lơ lửng', () => {
      const w = new Walker(doc, lib, { navMesh: false })
      const R = rng(7)
      const bad: string[] = []
      for (const f of floors) {
        const s0 = f.rooms.map((r) => roomSpot(f, lib, r.polygon)).find(Boolean)
        if (!s0) continue
        w.teleport(s0)
        let dir = { x: 1, z: 0 }
        for (let t = 0; t < 60; t += DT) {
          if (R() < DT) {
            const a = R() * Math.PI * 2
            dir = { x: Math.cos(a), z: Math.sin(a) }
          }
          w.move({ x: dir.x * 2.6, z: dir.z * 2.6 }, DT)
          const p = w.pos
          const fl = [...floors].reverse().find((x) => x.elevation / 1000 <= p.y + 0.3) ?? floors[0]
          const xy: [number, number] = [p.x * 1000, p.z * 1000]
          const onSlab = fl === floors[0] || slabOf(doc, fl).some((poly) => pointInPolygon(xy, poly))
          const onStair = doc.floors.flatMap((x) => x.stairs).some((st) => pointInPolygon(xy, st.polygon))
          const level = floors.some((x) => Math.abs(p.y - x.elevation / 1000) < 0.1) || onStair || (fl === floors[0] && p.y > -0.2 && p.y < 0.1)
          if ((!onSlab || (!level && w.grounded)) && bad.length < 5) bad.push(`${f.name}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`)
        }
      }
      w.dispose()
      expect(bad).toEqual([])
    }, 120_000)

    it('camera (cần lò xo) không bao giờ lọt ra sau tường / vào trong vật cản', () => {
      const w = new Walker(doc, lib, { navMesh: false })
      const R = rng(11)
      const bad: string[] = []
      for (const f of floors)
        for (const r of f.rooms) {
          const s = roomSpot(f, lib, r.polygon)
          if (!s) continue
          w.teleport(s)
          for (let k = 0; k < 12; k++) {
            const yaw = R() * Math.PI * 2
            const p = w.pos
            const target = { x: p.x, y: p.y + 1.2, z: p.z }
            const want = { x: target.x - Math.sin(yaw) * 3.6, y: target.y + 1.3, z: target.z - Math.cos(yaw) * 3.6 }
            const cam = w.springArm(target, want)
            if (w.castRay(target, cam) !== null) bad.push(`${f.name} · ${r.name}: có vật cản giữa người và camera`)
          }
        }
      w.dispose()
      expect(bad).toEqual([])
    }, 120_000)
  })
}
