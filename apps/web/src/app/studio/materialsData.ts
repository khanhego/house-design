import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ResolvedMaterial } from '@hd/core'
import { api } from '../../lib/api.ts'
import type { MaterialRow } from '../types.ts'

/** Thư viện vật liệu (item 03): kho chung + của khách `clientId` (BR-R3). `all` = QTV xem mọi khách. */
export const useMaterials = (opts: { clientId?: string | null; all?: boolean; includeRetired?: boolean } = {}) =>
  useQuery({
    queryKey: ['materials', opts.clientId ?? '', !!opts.all, !!opts.includeRetired],
    queryFn: () =>
      api<{ items: MaterialRow[] }>('GET', `materials?${new URLSearchParams({ ...(opts.clientId ? { clientId: opts.clientId } : {}), ...(opts.all ? { all: '1' } : {}), ...(opts.includeRetired ? { includeRetired: '1' } : {}) })}`),
  })

/** Dạng snapshot để trình dựng xem trước bằng cùng bộ dựng hình của trang xem. */
export const toResolvedMaterials = (rows: MaterialRow[] | undefined): Record<string, ResolvedMaterial> =>
  Object.fromEntries((rows ?? []).map((m) => [m.id, { key: m.key, name: m.name, category: m.category, tileMm: m.tileMm, color: m.color, roughness: m.roughness, metalness: m.metalness, maps: m.maps }]))

export const useResolvedMaterials = (clientId: string | null | undefined) => {
  const q = useMaterials({ clientId })
  return { rows: q.data?.items ?? [], resolved: useMemo(() => toResolvedMaterials(q.data?.items), [q.data]) }
}

/** Nhãn nguồn & giấy phép dùng chung với thư viện đồ và trang Nguồn đồ & vật liệu (@hd/core). */
export { LICENSE_LABEL, SOURCE_LABEL } from '@hd/core'
export const STATUS_LABEL: Record<MaterialRow['status'], string> = { draft: 'Nháp — chờ duyệt', ready: 'Sẵn dùng', retired: 'Ngừng dùng' }
