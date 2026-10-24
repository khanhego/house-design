import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api.ts'
import type { Me } from '../auth.tsx'
import type { ClientRow, ProjectRow } from '../types.ts'

export interface ScopeValue {
  clientId: string
  projectId: string
  houseId: string
}

/** Bộ lọc khách hàng (chỉ QTV, A6) · dự án · mẫu nhà dùng chung cho C4, C5. */
export const ScopeFilters = ({ me, value, onChange, requireProject }: { me: Me; value: ScopeValue; onChange: (v: ScopeValue) => void; requireProject?: boolean }) => {
  const admin = me.role === 'admin'
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => api<{ items: ClientRow[] }>('GET', 'clients'), enabled: admin })
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<{ items: ProjectRow[] }>('GET', 'projects') })
  const list = (projects.data?.items ?? []).filter((p) => !value.clientId || p.clientId === value.clientId)
  const houses = list.find((p) => p.id === value.projectId)?.houses ?? []
  return (
    <>
      {admin && (
        <label className="flt">Khách hàng
          <select value={value.clientId} onChange={(e) => onChange({ clientId: e.target.value, projectId: '', houseId: '' })}>
            <option value="">Tất cả</option>
            {clients.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="flt">Dự án
        <select value={value.projectId} onChange={(e) => onChange({ ...value, projectId: e.target.value, houseId: '' })}>
          {!requireProject && <option value="">Tất cả</option>}
          {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="flt">Mẫu nhà
        <select value={value.houseId} disabled={!value.projectId} onChange={(e) => onChange({ ...value, houseId: e.target.value })}>
          <option value="">Tất cả</option>
          {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
    </>
  )
}

/** Dự án đầu tiên — người duyệt bắt buộc chọn một dự án cho thống kê. */
export const useFirstProject = () => {
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<{ items: ProjectRow[] }>('GET', 'projects') })
  return { first: projects.data?.items[0]?.id ?? '', loading: projects.isLoading, empty: !!projects.data && !projects.data.items.length }
}

export const qs = (o: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString()
