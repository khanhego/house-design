import RAPIER from '@dimforge/rapier3d-compat'
import { init as initRecast, NavMeshQuery } from 'recast-navigation'
import type { NavMesh } from 'recast-navigation'
import { generateSoloNavMesh } from 'recast-navigation/generators'
import { boxTriangles, sortedFloors, walkGeometry, wallSegments } from '@hd/core'
import type { HouseDocument, NavLibrary, WalkBox } from '@hd/core'

/*
 * Người mẫu đi bộ bằng bộ vật lý (Rapier — bộ điều khiển nhân vật kiểu game) + navmesh (Recast/Detour) cho
 * "bấm sàn để đi tới". Khung va chạm lấy từ @hd/core walkGeometry: sàn thật từng tầng, tường, kính, dốc cầu thang,
 * lan can mép sàn tầng trên, đồ nội thất. Vì thế:
 * - không có sàn thì không đứng được (không đi ra khoảng không), tầng trên có lan can mép sàn;
 * - leo cầu thang liên tục bằng phím (dốc ≤ 50°, tự bước qua gờ ≤ 25 cm, bám sàn khi xuống);
 * - trượt êm dọc tường, lướt qua cạnh khung cửa (thân hình viên thuốc + hỗ trợ đi qua cửa).
 * Không phụ thuộc React / three.js — chạy được trong Node để kiểm thử mô phỏng.
 */

export const BODY_RADIUS = 0.2
const HALF_H = 0.65 // thân 1,7 m = 2 × 0,65 + 2 × 0,2
const CENTER = HALF_H + BODY_RADIUS
const GRAVITY = 9.81

let ready: Promise<void> | null = null
/** Nạp WASM của Rapier và Recast (một lần). */
export const loadPhysics = () => (ready ??= Promise.all([RAPIER.init(), initRecast()]).then(() => undefined))

export interface V3 {
  x: number
  y: number
  z: number
}

interface Portal {
  y: number
  c: [number, number]
  n: [number, number]
  half: number
}

export class Walker {
  readonly world: RAPIER.World
  readonly boxes: WalkBox[]
  private body: RAPIER.RigidBody
  private collider: RAPIER.Collider
  private kcc: RAPIER.KinematicCharacterController
  private vy = 0
  private portals: Portal[]
  /** collider.handle → chỉ số trong `boxes` (gỡ lỗi) */
  readonly boxOf = new Map<number, number>()
  navMesh: NavMesh | null = null
  private query: NavMeshQuery | null = null
  grounded = false

  constructor(doc: HouseDocument, lib: NavLibrary, opts: { navMesh?: boolean } = {}) {
    this.boxes = walkGeometry(doc, lib)
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 })
    this.boxes.forEach((b, i) => {
      const d = RAPIER.ColliderDesc.cuboid(b.h[0], b.h[1], b.h[2]).setTranslation(b.c[0], b.c[1], b.c[2]).setRotation({ x: b.q[0], y: b.q[1], z: b.q[2], w: b.q[3] })
      this.boxOf.set(this.world.createCollider(d).handle, i)
    })
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CENTER, 0))
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(HALF_H, BODY_RADIUS), this.body)
    this.kcc = this.world.createCharacterController(0.02)
    this.kcc.setUp({ x: 0, y: 1, z: 0 })
    this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180)
    this.kcc.enableAutostep(0.25, 0.1, false)
    this.kcc.enableSnapToGround(0.3)
    this.kcc.setSlideEnabled(true)
    this.kcc.setApplyImpulsesToDynamicBodies(false)
    this.portals = sortedFloors(doc).flatMap((f) =>
      wallSegments(f).flatMap((L) =>
        L.openings
          .filter((o) => o.opening.kind === 'door')
          .map((o) => {
            const s = (o.from + o.to) / 2
            return { y: f.elevation / 1000, c: [(L.wall.a[0] + L.frame.u[0] * s) / 1000, (L.wall.a[1] + L.frame.u[1] * s) / 1000] as [number, number], n: [L.frame.n[0], L.frame.n[1]] as [number, number], half: (o.to - o.from) / 2000 }
          }),
      ),
    )
    this.world.step()
    if (opts.navMesh !== false) this.buildNavMesh()
  }

  private buildNavMesh() {
    const { positions, indices } = boxTriangles(this.boxes)
    const cs = 0.05
    const ch = 0.02
    const r = generateSoloNavMesh(positions, indices, {
      cs,
      ch,
      walkableSlopeAngle: 50,
      walkableHeight: Math.ceil(1.7 / ch),
      walkableClimb: Math.floor(0.25 / ch),
      walkableRadius: Math.ceil(BODY_RADIUS / cs),
      maxEdgeLen: Math.round(6 / cs),
      maxSimplificationError: 1.1,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
    })
    if (!r.success) return
    this.navMesh = r.navMesh
    this.query = new NavMeshQuery(r.navMesh)
  }

  /** Vị trí bàn chân (m). */
  get pos(): V3 {
    const t = this.body.translation()
    return { x: t.x, y: t.y - CENTER, z: t.z }
  }

  /** Đặt người tại (x, y bàn chân, z). */
  teleport(p: V3) {
    this.body.setTranslation({ x: p.x, y: p.y + CENTER + 0.02, z: p.z }, true)
    this.vy = 0
    this.world.step()
  }

  private tryMove(d: V3): V3 {
    this.kcc.computeColliderMovement(this.collider, d, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
    return this.kcc.computedMovement()
  }

  /**
   * Đi một bước: `vel` là vận tốc ngang mong muốn (m/s). Có trọng lực, leo dốc / bậc, trượt dọc tường;
   * bị chặn gần ô cửa thì kéo hướng đi vào giữa cửa. Trả quãng đường ngang đã đi (m).
   */
  move(vel: { x: number; z: number }, dt: number): number {
    dt = Math.min(dt, 0.05)
    // đang chạm đất: không thêm thành phần đi xuống (bám sàn đã có snap-to-ground) — leo dốc không bị chậm
    this.vy = this.grounded ? 0 : Math.max(-20, this.vy - GRAVITY * dt)
    const want: V3 = { x: vel.x * dt, y: this.vy * dt, z: vel.z * dt }
    let mv = this.tryMove(want)
    const wantH = Math.hypot(want.x, want.z)
    let gotH = Math.hypot(mv.x, mv.z)
    if (wantH > 1e-4 && gotH < wantH * 0.6) {
      const steer = this.doorSteer({ x: want.x / wantH, z: want.z / wantH })
      if (steer) {
        const alt = this.tryMove({ x: steer.x * wantH, y: want.y, z: steer.z * wantH })
        const altH = Math.hypot(alt.x, alt.z)
        if (altH > gotH) (mv = alt), (gotH = altH)
        else this.tryMove(want) // giữ trạng thái chạm đất của lần thử chính
      }
    }
    this.grounded = this.kcc.computedGrounded()
    const t = this.body.translation()
    this.body.setTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }, true)
    this.world.step()
    if (this.grounded) this.vy = 0
    return gotH
  }

  private doorSteer(dir: { x: number; z: number }): { x: number; z: number } | null {
    const p = this.pos
    let best: [number, number] | null = null
    let bd = Infinity
    for (const d of this.portals) {
      if (Math.abs(d.y - p.y) > 1) continue
      const vx = d.c[0] - p.x
      const vz = d.c[1] - p.z
      const dist = Math.hypot(vx, vz)
      if (dist > 1.6 || dist < 1e-3) continue
      const along = vx * d.n[0] + vz * d.n[1]
      const dn = dir.x * d.n[0] + dir.z * d.n[1]
      const side = Math.sign(along) || Math.sign(dn) || 1
      if (dn * side < 0.25) continue
      const aim: [number, number] = Math.abs(along) > 0.15 ? [d.c[0] - d.n[0] * side * 0.05, d.c[1] - d.n[1] * side * 0.05] : [d.c[0] + d.n[0] * side * 0.5, d.c[1] + d.n[1] * side * 0.5]
      if (dist < bd) (bd = dist), (best = aim)
    }
    if (!best) return null
    const ax = best[0] - p.x
    const az = best[1] - p.z
    const al = Math.hypot(ax, az) || 1
    const mx = dir.x * 0.3 + (ax / al) * 0.7
    const mz = dir.z * 0.3 + (az / al) * 0.7
    const ml = Math.hypot(mx, mz) || 1
    return { x: mx / ml, z: mz / ml }
  }

  /** Đường đi trên navmesh (m) từ chỗ đang đứng tới `to`; null nếu không có. Điểm cuối là điểm đi được gần `to` nhất. */
  pathTo(to: V3): V3[] | null {
    if (!this.query) return null
    const from = this.pos
    const ext = { x: 0.6, y: 0.8, z: 0.6 }
    // ưu tiên điểm đi được ở đúng độ cao được bấm (sàn), không lấy mặt bàn / mặt giường gần đó
    const near = (p: V3, h: number) => {
      for (const y of [0.25, 0.8]) {
        const r = this.query!.findClosestPoint(p, { halfExtents: { x: h, y, z: h } })
        if (r.success && Math.abs(r.point.y - p.y) <= y) return r
      }
      return { success: false, point: p } as const
    }
    const s = near(from, 0.6)
    const e = near(to, 1.5)
    if (!s.success || !e.success) return null
    const r = this.query.computePath(s.point, e.point, { halfExtents: ext })
    if (!r.success || !r.path.length) return null
    const last = r.path[r.path.length - 1]
    if (Math.hypot(last.x - e.point.x, last.z - e.point.z) > 0.3 || Math.abs(last.y - e.point.y) > 0.4) return null // chỉ tới được một phần
    return r.path.map((q) => ({ x: q.x, y: q.y, z: q.z }))
  }

  /** Điểm đi được gần `p` nhất trên navmesh. */
  closestWalkable(p: V3, ext = 1): V3 | null {
    if (!this.query) return null
    const r = this.query.findClosestPoint(p, { halfExtents: { x: ext, y: 0.25, z: ext } })
    return r.success ? r.point : null
  }

  /** Camera chỉ tránh thứ nhìn thấy và chắn tầm nhìn: tường, kính, sàn / trần, cầu thang — bỏ qua đồ nội thất và lan can vô hình. */
  private readonly forCamera = (c: RAPIER.Collider) => {
    const i = this.boxOf.get(c.handle)
    const k = i == null ? null : this.boxes[i].kind
    return k !== 'item' && k !== 'rail'
  }

  /** Tia từ `a` tới `b`: khoảng cách tới vật cản đầu tiên (m), hoặc null nếu thông. Bỏ qua chính người mẫu; `camera` = chỉ vật chắn tầm nhìn. */
  castRay(a: V3, b: V3, opts: { camera?: boolean } = {}): number | null {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-6) return null
    const ray = new RAPIER.Ray(a, { x: dx / len, y: dy / len, z: dz / len })
    const hit = this.world.castRay(ray, len, true, undefined, undefined, this.collider, undefined, opts.camera ? this.forCamera : undefined)
    return hit ? hit.timeOfImpact : null
  }

  /** Từ `target` lùi về phía `want`: quãng đi được trước vật chắn tầm nhìn (cầu chiếu bán kính 0,15 m). */
  private armLength(target: V3, dir: V3, len: number, pad: number) {
    const ball = new RAPIER.Ball(0.15)
    const hit = this.world.castShape(target, { x: 0, y: 0, z: 0, w: 1 }, dir, ball, 0, len, true, undefined, undefined, this.collider, undefined, this.forCamera)
    return hit ? Math.max(0.05, hit.time_of_impact - pad + 0.15) : len
  }

  /**
   * Cần lò xo của camera: từ tâm nhìn `target` lùi về phía `want`, dừng trước tường / kính / trần (không tính đồ nội
   * thất và lan can). Phía sau bị chặn gần thì thử nâng camera cao dần (nhìn qua vai từ trên xuống) và lấy vị trí cho
   * khoảng nhìn ngang xa nhất — góc nhìn không bị "dí" sát lưng người mẫu. Trả vị trí và tỉ lệ khoảng lùi đạt được (0…1).
   */
  springArm(target: V3, want: V3, pad = 0.18): V3 & { ratio: number } {
    const dx = want.x - target.x
    const dy = want.y - target.y
    const dz = want.z - target.z
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-4) return { ...want, ratio: 1 }
    const horiz = Math.hypot(dx, dz) || 1e-6
    let best: (V3 & { ratio: number }) | null = null
    for (const lift of [0, 0.5, 1.0]) {
      const wy = dy + lift
      const l = Math.hypot(dx, wy, dz)
      const dir = { x: dx / l, y: wy / l, z: dz / l }
      const d = this.armLength(target, dir, l, pad)
      const ratio = Math.min(1, (Math.hypot(dir.x, dir.z) * d) / horiz)
      // nâng camera chỉ khi được lợi rõ (≥ 15 % khoảng lùi)
      if (!best || ratio > best.ratio + 0.15) best = { x: target.x + dir.x * d, y: target.y + dir.y * d, z: target.z + dir.z * d, ratio }
      if (ratio > 0.98) break
    }
    return best!
  }

  dispose() {
    this.query?.destroy()
    this.navMesh?.destroy()
    this.world.free()
  }
}
