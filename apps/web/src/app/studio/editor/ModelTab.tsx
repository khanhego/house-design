import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BUDGET, budgetForFloor, levelOf, bboxOf, wallsOutline } from '@hd/core'
import type { Check, ModelRef } from '@hd/core'
import { upload } from '../../../lib/api.ts'
import { fmtInt } from '../../../i18n/vi.ts'
import { Badge, Button, errMsg, toast } from '../../ui.tsx'
import { currentFloor, useEditor } from './store.ts'
import { EditorScene, useResolved } from './EditorScene.tsx'
import type { ModelOut } from '../../types.ts'

type Scope = 'floor' | 'exterior' | 'whole'
const SCOPE: Record<Scope, string> = { floor: 'Tầng đang chọn', exterior: 'Ngoại thất / cảnh quan', whole: 'Cả nhà (một tệp)' }
const MB = (b: number) => `${(b / 2 ** 20).toFixed(1)} MB`
const LEVEL = { ok: ['Đạt', 'ok'], warn: ['Cảnh báo', 'warn'], block: ['Chặn', 'danger'] } as const

/** Tab Mô hình (FR-04.01–04.03, BR-07, EX-4). */
export const ModelTab = ({ projectId }: { projectId: string; onChecks?: (c: Check[]) => void }) => {
  const qc = useQueryClient()
  const doc = useEditor((s) => s.doc)!
  const floorId = useEditor((s) => s.floorId)
  const locked = useEditor((s) => s.state !== 'draft')
  const { edit, editFloor } = useEditor.getState()
  const floor = currentFloor({ doc, floorId })!
  const { resolved, models, library } = useResolved(doc)
  const [scope, setScope] = useState<Scope>('floor')
  const [progress, setProgress] = useState<number | null>(null)
  const [gizmo, setGizmo] = useState<'translate' | 'rotate'>('translate')

  const ref: ModelRef | undefined = scope === 'floor' ? floor.modelRef : scope === 'exterior' ? doc.exterior?.modelRef : doc.wholeModel
  const model: ModelOut | undefined = ref ? models[ref.modelAssetId] : undefined
  const setRef = (r: ModelRef | undefined) =>
    scope === 'floor' ? editFloor((f) => void (f.modelRef = r), { coalesce: `ref:${floorId}` }) : edit((d) => void (scope === 'exterior' ? (d.exterior = r ? { modelRef: r } : undefined) : (d.wholeModel = r)), { coalesce: `ref:${scope}` })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 100 * 2 ** 20) toast('Tệp trên 100 MB sẽ xử lý lâu; nên giảm chi tiết trong phần mềm gốc.', 'danger')
    try {
      setProgress(0)
      const r = await upload<{ model: ModelOut }>(`projects/${projectId}/models`, file, {}, setProgress)
      qc.setQueryData(['model', r.model.id], r.model)
      setRef({ modelAssetId: r.model.id, offset: [0, 0, scope === 'floor' ? floor.elevation : 0], rotation: 0, scale: 1 })
      toast('Đã tải lên — đang tối ưu mô hình')
    } catch (e) {
      toast(errMsg(e), 'danger')
    } finally {
      setProgress(null)
    }
  }

  // ngân sách góc xem tầng (BR-07)
  const ctx = useMemo(() => ({
    models: Object.fromEntries(Object.entries(models).map(([k, m]) => [k, { status: m.status, report: m.report }])),
    libraryModels: Object.fromEntries(library.map((i) => [i.id, i.model?.id ?? null])),
  }), [models, library])
  const totals = budgetForFloor(doc, floor, ctx)
  const lv = levelOf(totals)

  // EX-4: so khung bao mặt bằng của mô hình (đã biến đổi) với mép ngoài tường
  const misalign = useMemo(() => {
    if (!ref || !model?.report || scope !== 'floor') return null
    const pts = wallsOutline(floor)
    if (!pts.length) return null
    const wb = bboxOf(pts)
    const { min, max } = model.report.bbox
    const corners = [[min[0], min[2]], [max[0], min[2]], [max[0], max[2]], [min[0], max[2]]].map(([x, z]) => {
      const a = (ref.rotation * Math.PI) / 180
      const X = x * 1000 * ref.scale
      const Z = z * 1000 * ref.scale
      return [ref.offset[0] + X * Math.cos(a) - Z * Math.sin(a), ref.offset[1] + X * Math.sin(a) + Z * Math.cos(a)] as [number, number]
    })
    const mb = bboxOf(corners)
    const d = { trái: Math.abs(mb.minX - wb.minX), phải: Math.abs(mb.maxX - wb.maxX), trên: Math.abs(mb.minY - wb.minY), dưới: Math.abs(mb.maxY - wb.maxY) }
    const worst = Object.entries(d).sort((a, b) => b[1] - a[1])[0]
    return worst[1] > 200 ? `Mô hình lệch khung ${fmtInt(Math.round(worst[1]))} mm ở cạnh ${worst[0]}` : null
  }, [ref, model, scope, floor])

  const num = (label: string, value: number, on: (n: number) => void, unit = 'mm', step = 10) => (
    <label className="ins-field">
      <span>{label}</span>
      <span className="ins-num"><input type="number" value={value} step={step} disabled={locked} onChange={(e) => e.target.value !== '' && on(Number(e.target.value))} /><em>{unit}</em></span>
    </label>
  )

  return (
    <div className="ed-3d">
      <div className="ed-3d-view">
        <EditorScene doc={doc} floorId={floorId} resolved={resolved} align={ref && model?.status === 'ready' && !locked ? { ref, mode: gizmo, onChange: setRef } : null} showAllFloors={scope !== 'floor'} />
      </div>
      <aside className="ed-right">
        <div className="ins">
          <h3>Mô hình hiển thị</h3>
          <label className="ins-field"><span>Gắn cho</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>{Object.entries(SCOPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="ab ab-primary ab-sm" aria-disabled={locked}>
            {ref ? 'Thay tệp GLB' : 'Tải GLB lên'}
            <input type="file" hidden accept=".glb,.gltf" disabled={locked} onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {progress !== null && <div className="bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          <p className="muted small">Xuất GLB từ SketchUp 2025+, Blender hoặc 3ds Max (plugin glTF). Đặt tên nhóm <code>item_…</code> cho đồ muốn gắn thông tin, <code>wall_…</code> cho tường (nên gộp tường theo phòng).</p>

          {model && (
            <div className="report">
              <div className="report-head"><strong>{model.originalName}</strong>{model.level && <Badge tone={LEVEL[model.level][1]}>{LEVEL[model.level][0]}</Badge>}</div>
              {model.status === 'processing' && <p className="small">Đang tối ưu mô hình… (thường dưới 2 phút)</p>}
              {model.status === 'failed' && <p className="small danger">{model.error}</p>}
              {model.report && (
                <dl className="kv">
                  <dt>Tam giác</dt><dd>{fmtInt(model.report.triangles)}</dd>
                  <dt>Draw call</dt><dd>{fmtInt(model.report.drawCalls)}</dd>
                  <dt>Texture (GPU)</dt><dd>{MB(model.report.textureBytes)}</dd>
                  <dt>Dung lượng</dt><dd>{MB(model.report.fileBytes)}</dd>
                  <dt>Đối tượng gắn được</dt><dd>{model.report.nodeNames.filter((n) => /^item_/i.test(n)).length} đồ · {model.report.nodeNames.filter((n) => /^wall_/i.test(n)).length} tường</dd>
                </dl>
              )}
            </div>
          )}
          {ref && model?.status === 'ready' && (
            <>
              <h3>Căn mô hình</h3>
              <div className="ins-row">
                <Button small kind={gizmo === 'translate' ? 'primary' : 'default'} onClick={() => setGizmo('translate')}>Dịch</Button>
                <Button small kind={gizmo === 'rotate' ? 'primary' : 'default'} onClick={() => setGizmo('rotate')}>Xoay</Button>
              </div>
              {num('X', ref.offset[0], (n) => setRef({ ...ref, offset: [n, ref.offset[1], ref.offset[2]] }))}
              {num('Y (mặt bằng)', ref.offset[1], (n) => setRef({ ...ref, offset: [ref.offset[0], n, ref.offset[2]] }))}
              {num('Cao độ', ref.offset[2], (n) => setRef({ ...ref, offset: [ref.offset[0], ref.offset[1], n] }))}
              {num('Xoay', ref.rotation, (n) => setRef({ ...ref, rotation: n }), '°', 1)}
              {num('Tỷ lệ', ref.scale, (n) => n > 0 && setRef({ ...ref, scale: n }), '×', 0.01)}
              {misalign && <div className="ins-status warn">{misalign}</div>}
              <Button small kind="ghost" disabled={locked} onClick={() => setRef(undefined)}>Gỡ mô hình khỏi {SCOPE[scope].toLowerCase()}</Button>
            </>
          )}

          <h3>Ngân sách hiển thị — {floor.name}</h3>
          <dl className="kv">
            <dt>Tam giác</dt><dd>{fmtInt(totals.triangles)} / {fmtInt(BUDGET.block.triangles)}</dd>
            <dt>Draw call</dt><dd>{fmtInt(totals.drawCalls)} / {BUDGET.block.drawCalls}</dd>
            <dt>Texture</dt><dd>{MB(totals.textureBytes)} / {MB(BUDGET.block.textureBytes)}</dd>
            <dt>Tải về</dt><dd>{MB(totals.fileBytes)} / {MB(BUDGET.block.fileBytes)}</dd>
          </dl>
          <div className={`ins-status ${lv.level === 'ok' ? 'ok' : 'warn'}`}>{lv.level === 'ok' ? 'Trong ngân sách' : lv.level === 'warn' ? 'Gần vượt ngân sách — xem lại mô hình' : 'Vượt ngân sách — không gửi duyệt được'}</div>
        </div>
      </aside>
    </div>
  )
}
