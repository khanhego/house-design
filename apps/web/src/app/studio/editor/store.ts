import { create } from 'zustand'
import { sortedFloors } from '@hd/core'
import type { Floor, HouseDocument, Point } from '@hd/core'

/* Store trình dựng A3 (02b §3.1). Mỗi thao tác sửa đẩy bản sao tài liệu vào ngăn hoàn tác (tối đa 100). */

export type Tool = 'select' | 'calibrate' | 'wall' | 'room' | 'door' | 'window' | 'stair' | 'area' | 'outline' | 'measure'
export type Tab = 'frame' | 'model' | 'items' | 'finish' | 'views' | 'tour'
export type SelKind = 'wall' | 'opening' | 'room' | 'stair' | 'area' | 'outline' | 'item'
export interface Selection {
  kind: SelKind
  id: string
}
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'locked'

interface EditorState {
  versionId: string
  houseId: string
  state: string
  doc: HouseDocument | null
  revision: number
  floorId: string
  tab: Tab
  tool: Tool
  selection: Selection | null
  undo: HouseDocument[]
  redo: HouseDocument[]
  dirty: boolean
  saveState: SaveState
  savedAt: string | null
  /** khách hàng của dự án — lọc vật liệu riêng của khách (item 03, BR-R3) */
  clientId: string | null
  setClientId: (id: string | null) => void
  /** điểm đang vẽ dở (mm) */
  draft: Point[]
  load: (p: { versionId: string; houseId: string; state: string; doc: HouseDocument; revision: number }) => void
  setTab: (t: Tab) => void
  setTool: (t: Tool) => void
  setFloor: (id: string) => void
  select: (s: Selection | null) => void
  setDraft: (d: Point[]) => void
  /** sửa tài liệu; ghi vào ngăn hoàn tác */
  edit: (fn: (doc: HouseDocument) => void, opts?: { coalesce?: string }) => void
  /** sửa tầng đang chọn */
  editFloor: (fn: (f: Floor, doc: HouseDocument) => void, opts?: { coalesce?: string }) => void
  doUndo: () => void
  doRedo: () => void
  saved: (revision: number) => void
  setSaveState: (s: SaveState) => void
}

let lastCoalesce: { key: string; at: number } | null = null

export const useEditor = create<EditorState>((set, get) => ({
  versionId: '',
  houseId: '',
  state: 'draft',
  doc: null,
  revision: 0,
  floorId: '',
  tab: 'frame',
  tool: 'select',
  selection: null,
  undo: [],
  redo: [],
  dirty: false,
  saveState: 'idle',
  savedAt: null,
  clientId: null,
  setClientId: (clientId) => set({ clientId }),
  draft: [],
  load: ({ versionId, houseId, state, doc, revision }) =>
    set({
      versionId, houseId, state, doc, revision,
      floorId: get().floorId && doc.floors.some((f) => f.id === get().floorId) ? get().floorId : sortedFloors(doc)[0]?.id ?? '',
      undo: [], redo: [], dirty: false, selection: null, draft: [],
      saveState: state === 'draft' ? 'idle' : 'locked',
    }),
  setTab: (tab) => set({ tab, tool: 'select', draft: [], selection: null }),
  setTool: (tool) => set({ tool, draft: [], selection: tool === 'select' ? get().selection : null }),
  setFloor: (floorId) => set({ floorId, selection: null, draft: [] }),
  select: (selection) => set({ selection }),
  setDraft: (draft) => set({ draft }),
  edit: (fn, opts) => {
    const { doc, state } = get()
    if (!doc || state !== 'draft') return
    const before = structuredClone(doc)
    const next = structuredClone(doc)
    fn(next)
    // gộp các thay đổi liên tiếp cùng khoá (vd gõ số trong ô) thành một bước hoàn tác
    const now = Date.now()
    const merge = opts?.coalesce && lastCoalesce?.key === opts.coalesce && now - lastCoalesce.at < 1200
    lastCoalesce = opts?.coalesce ? { key: opts.coalesce, at: now } : null
    set((s) => ({ doc: next, undo: merge ? s.undo : [...s.undo.slice(-99), before], redo: [], dirty: true }))
  },
  editFloor: (fn, opts) =>
    get().edit((doc) => {
      const f = doc.floors.find((x) => x.id === get().floorId)
      if (f) fn(f, doc)
    }, opts),
  doUndo: () => {
    const { undo, doc } = get()
    if (!undo.length || !doc) return
    set((s) => ({ doc: undo[undo.length - 1], undo: s.undo.slice(0, -1), redo: [...s.redo, doc], dirty: true, selection: null }))
  },
  doRedo: () => {
    const { redo, doc } = get()
    if (!redo.length || !doc) return
    set((s) => ({ doc: redo[redo.length - 1], redo: s.redo.slice(0, -1), undo: [...s.undo, doc], dirty: true, selection: null }))
  },
  saved: (revision) => set({ revision, saveState: 'saved', savedAt: new Date().toISOString() }),
  setSaveState: (saveState) => set({ saveState }),
}))

export const currentFloor = (s: Pick<EditorState, 'doc' | 'floorId'>) => s.doc?.floors.find((f) => f.id === s.floorId) ?? null
