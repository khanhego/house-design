import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useQueries, useQuery } from '@tanstack/react-query'
import { bboxOf, sortedFloors, wallsOutline } from '@hd/core'
import type { Floor, HouseDocument, ModelRef, ResolvedLibraryItem, ResolvedModel, Snapshot } from '@hd/core'
import { api } from '../../../lib/api.ts'
import { FloorGroup } from '../../../scene/FloorGroup.tsx'
import { FloorItems } from '../../../scene/Items.tsx'
import { GlbModel } from '../../../scene/GlbModel.tsx'
import { M } from '../../../scene/units.ts'
import type { LibraryRow, ModelOut } from '../../types.ts'

/** Mô hình được tham chiếu trong tài liệu (tầng, ngoại thất, cả nhà, node đồ). */
export const modelIdsOf = (doc: HouseDocument) => {
  const ids = new Set<string>()
  for (const f of doc.floors) {
    if (f.modelRef) ids.add(f.modelRef.modelAssetId)
    for (const it of f.items) if ('modelNode' in it.source) ids.add(it.source.modelNode.modelAssetId)
  }
  if (doc.exterior?.modelRef) ids.add(doc.exterior.modelRef.modelAssetId)
  if (doc.wholeModel) ids.add(doc.wholeModel.modelAssetId)
  return [...ids]
}

/** Dữ liệu đã giải (đồ thư viện, URL mô hình) cho cảnh 3D trong trình dựng. */
export const useResolved = (doc: HouseDocument | null) => {
  const lib = useQuery({ queryKey: ['library', '', ''], queryFn: () => api<{ items: LibraryRow[] }>('GET', 'library/items?q=&category=') })
  const ids = doc ? modelIdsOf(doc) : []
  const models = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['model', id],
      queryFn: () => api<{ model: ModelOut }>('GET', `models/${id}`).then((r) => r.model),
      refetchInterval: (q: { state: { data?: ModelOut } }) => (q.state.data?.status === 'processing' ? 2000 : false),
    })),
  })
  const modelMap = useMemo(() => {
    const m: Record<string, ModelOut> = {}
    models.forEach((q, i) => q.data && (m[ids[i]] = q.data))
    return m
  }, [models.map((q) => q.dataUpdatedAt).join(','), ids.join(',')])
  const resolved = useMemo<Snapshot['resolved']>(() => {
    const libraryItems: Record<string, ResolvedLibraryItem> = {}
    for (const it of lib.data?.items ?? []) {
      libraryItems[it.id] = {
        name: it.name, category: it.category as ResolvedLibraryItem['category'], sizeMm: it.sizeMm, material: it.material ?? undefined, brand: it.brand ?? undefined,
        description: it.description ?? undefined, imageUrls: it.imageUrls, variants: it.variants, modelUrl: it.model?.status === 'ready' ? it.model.url : null,
        modelAssetId: it.model?.status === 'ready' ? it.model.id : null, fallbackShape: (it.fallbackShape as ResolvedLibraryItem['fallbackShape']) ?? null,
      }
    }
    const ms: Record<string, ResolvedModel> = {}
    for (const [id, m] of Object.entries(modelMap)) if (m.status === 'ready' && m.url && m.report) ms[id] = { url: m.url, bbox: m.report.bbox, report: m.report }
    return { libraryItems, models: ms, files: {} }
  }, [lib.data, modelMap])
  return { resolved, models: modelMap, library: lib.data?.items ?? [] }
}

const CamExport = ({ camRef, targetRef }: { camRef: React.RefObject<THREE.Camera | null>; targetRef: React.RefObject<THREE.Vector3> }) => {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null
  useEffect(() => {
    camRef.current = camera
  }, [camera, camRef])
  useEffect(() => {
    if (controls?.target) targetRef.current = controls.target
  }, [controls, targetRef])
  return null
}

export interface EditorSceneProps {
  doc: HouseDocument
  floorId: string
  resolved: Snapshot['resolved']
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
  /** bấm sàn (mm, cao độ sàn tầng) */
  onFloorPoint?: (p: [number, number]) => void
  onPickNode?: (modelAssetId: string, nodeName: string) => void
  /** căn mô hình bằng gizmo */
  align?: { ref: ModelRef; onChange: (r: ModelRef) => void; mode: 'translate' | 'rotate' } | null
  camRef?: React.RefObject<THREE.Camera | null>
  targetRef?: React.RefObject<THREE.Vector3>
  showAllFloors?: boolean
  night?: boolean
}

/** Cảnh 3D của trình dựng (tab Mô hình, Đồ, Điểm nhìn) — dùng lại thành phần của trang xem. */
export const EditorScene = (p: EditorSceneProps) => {
  const floors = useMemo(() => sortedFloors(p.doc), [p.doc])
  const floor = floors.find((f) => f.id === p.floorId) ?? floors[0]
  const visible = p.showAllFloors ? floors : floors.filter((f) => f.elevation <= floor.elevation)
  const target = useRef(new THREE.Vector3())
  const camLocal = useRef<THREE.Camera | null>(null)
  const tgtLocal = useRef(new THREE.Vector3())
  const pts = wallsOutline(floor)
  const b = pts.length ? bboxOf(pts) : { minX: 0, minY: 0, maxX: 10000, maxY: 10000 }
  const cx = M((b.minX + b.maxX) / 2)
  const cz = M((b.minY + b.maxY) / 2)
  const span = Math.max(M(b.maxX - b.minX), M(b.maxY - b.minY), 6)
  const nodeOwner = useMemo(() => {
    // modelAssetId của mô hình gắn tầng/ngoại thất/cả nhà để biết node được bấm thuộc mô hình nào
    return (fid: string | null) => (fid ? floors.find((f) => f.id === fid)?.modelRef?.modelAssetId : p.doc.wholeModel?.modelAssetId ?? p.doc.exterior?.modelRef?.modelAssetId)
  }, [floors, p.doc])

  return (
    <Canvas shadows camera={{ position: [cx + span * 0.8, M(floor.elevation) + span, cz + span * 0.9], fov: 45, near: 0.05, far: 500 }} gl={{ preserveDrawingBuffer: true }} onPointerMissed={() => p.onSelectItem?.(null)}>
      <color attach="background" args={[p.night ? '#1a1e28' : '#ebe7e0']} />
      <hemisphereLight args={['#fffaf0', '#b9ab98', p.night ? 0.3 : 1.1]} />
      <directionalLight position={[cx + span, span * 1.4, cz - span]} intensity={p.night ? 0.3 : 2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} />
      <OrbitControls makeDefault target={[cx, M(floor.elevation), cz]} maxPolarAngle={Math.PI * 0.49} />
      <CamExport camRef={p.camRef ?? camLocal} targetRef={p.targetRef ?? tgtLocal} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, M(floor.elevation) + 0.001, cz]} onClick={(e) => p.onFloorPoint && (e.stopPropagation(), p.onFloorPoint([Math.round(e.point.x * 1000), Math.round(e.point.z * 1000)]))}>
        <planeGeometry args={[span * 6, span * 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.16, cz]} receiveShadow>
        <circleGeometry args={[span * 4, 48]} />
        <meshStandardMaterial color="#dcd6cc" />
      </mesh>
      {visible.map((f: Floor) => {
        const hasModel = !!f.modelRef && !!p.resolved.models[f.modelRef.modelAssetId]
        return (
          <group key={f.id}>
            <FloorGroup floor={f} rise={f.height} showWalls={!hasModel && !p.doc.wholeModel} wallMode={f.id === floor.id ? 'low' : 'full'} target={target} selectedRoomId={null} onRoomClick={p.onFloorPoint ? (_r, pt) => p.onFloorPoint!([Math.round(pt.x * 1000), Math.round(pt.z * 1000)]) : undefined} />
            {f.modelRef && p.resolved.models[f.modelRef.modelAssetId] && (
              <Suspense fallback={null}>
                {p.align && f.id === floor.id && p.align.ref.modelAssetId === f.modelRef.modelAssetId ? (
                  <AlignGizmo r={p.align.ref} url={p.resolved.models[f.modelRef.modelAssetId].url} mode={p.align.mode} onChange={p.align.onChange} floorElevationM={M(f.elevation)} target={target} />
                ) : (
                  <GlbModel url={p.resolved.models[f.modelRef.modelAssetId].url} modelRef={f.modelRef} floorElevationM={M(f.elevation)} wallMode="low" target={target} topClipY={null} onPickNode={p.onPickNode ? (n) => p.onPickNode!(nodeOwner(f.id)!, n) : undefined} />
                )}
              </Suspense>
            )}
            <FloorItems floor={f} libraryItems={p.resolved.libraryItems} variants={{}} selectedItemId={p.selectedItemId ?? null} onSelect={(id) => p.onSelectItem?.(id)} onHover={() => {}} />
          </group>
        )
      })}
      {(['wholeModel', 'exterior'] as const).map((k) => {
        const ref = k === 'wholeModel' ? p.doc.wholeModel : p.doc.exterior?.modelRef
        const m = ref ? p.resolved.models[ref.modelAssetId] : null
        if (!ref || !m) return null
        if (p.align && p.align.ref.modelAssetId === ref.modelAssetId)
          return <Suspense key={k} fallback={null}><AlignGizmo r={p.align.ref} url={m.url} mode={p.align.mode} onChange={p.align.onChange} floorElevationM={0} target={target} /></Suspense>
        return (
          <Suspense key={k} fallback={null}>
            <GlbModel url={m.url} modelRef={ref} floorElevationM={M(floor.elevation)} wallMode="full" target={target} topClipY={p.showAllFloors ? null : M(floor.elevation + floor.height)} onPickNode={p.onPickNode ? (n) => p.onPickNode!(ref.modelAssetId, n) : undefined} />
          </Suspense>
        )
      })}
    </Canvas>
  )
}

/** Gizmo căn mô hình (FR-04.03): kéo để dịch/xoay; ghi ngược ra ModelRef (mm, độ). */
const AlignGizmo = ({ r, url, mode, onChange, floorElevationM, target }: { r: ModelRef; url: string; mode: 'translate' | 'rotate'; onChange: (r: ModelRef) => void; floorElevationM: number; target: React.RefObject<THREE.Vector3> }) => {
  const group = useRef<THREE.Group>(null)
  return (
    <>
      <group ref={group} position={[M(r.offset[0]), M(r.offset[2]), M(r.offset[1])]} rotation={[0, -(r.rotation * Math.PI) / 180, 0]} scale={r.scale}>
        <GlbModel url={url} modelRef={{ ...r, offset: [0, 0, 0], rotation: 0, scale: 1 }} floorElevationM={floorElevationM} wallMode="full" target={target} topClipY={null} />
      </group>
      <TransformControls
        object={group as unknown as React.RefObject<THREE.Object3D>}
        mode={mode}
        showX={mode === 'translate'}
        showZ={mode === 'translate'}
        showY={mode === 'rotate' || mode === 'translate'}
        onMouseUp={() => {
          const g = group.current
          if (!g) return
          onChange({ ...r, offset: [Math.round(g.position.x * 1000), Math.round(g.position.z * 1000), Math.round(g.position.y * 1000)], rotation: Math.round((-g.rotation.y * 180) / Math.PI * 10) / 10 })
        }}
      />
    </>
  )
}
