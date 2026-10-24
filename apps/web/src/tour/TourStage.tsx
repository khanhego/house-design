import { useEffect, useMemo } from 'react'
import type { Floor, HouseDocument, TourScene } from '@hd/core'
import { TourPlayer } from './TourPlayer.tsx'
import type { PlayerScene } from './TourPlayer.tsx'

const opened = new Set<string>()
const completed = new Set<string>()

/** Tab "Ảnh thật" trong V2 (V6): chuyển dữ liệu tour đã phát hành sang trình xem, ghi sự kiện. */
export const TourStage = ({ doc, files, floors, has3d, onLead, events, onScene, onAction }: {
  doc: HouseDocument
  files: Record<string, string>
  floors: Floor[]
  has3d: boolean
  onLead?: () => void
  events: { tourOpen?: () => void; tourScene?: (id: string) => void; tourComplete?: () => void }
  onScene: (sceneId: string) => void
  onAction: (scene: TourScene, action: '3d' | 'plan') => void
}) => {
  const raw = useMemo(() => (doc.tour?.scenes ?? []).filter((s) => files[s.fileId] && files[s.smallFileId]), [doc.tour, files])
  const scenes: PlayerScene[] = useMemo(
    () =>
      raw.map((s) => {
        const room = s.floorId && s.roomId ? floors.find((f) => f.id === s.floorId)?.rooms.find((r) => r.id === s.roomId) : undefined
        return {
          id: s.id,
          title: s.title,
          description: s.description,
          highlights: s.highlights,
          next: s.next,
          src: files[s.fileId],
          srcSmall: files[s.smallFileId],
          clip: s.clipFileId ? files[s.clipFileId] ?? null : null,
          roomLabel: has3d && room ? room.name.toLowerCase() : null,
        }
      }),
    [raw, files, floors, has3d],
  )
  // mỗi lần tải trang chỉ ghi một lần mở / hoàn thành tour, chuyển tab qua lại không đếm lặp (R-T-11)
  const key = doc.tour?.scenes[0]?.id ?? ''
  useEffect(() => {
    if (!opened.has(key)) (opened.add(key), events.tourOpen?.())
  }, [key])
  const hasClipAi = raw.some((s) => s.clipSource === 'ai')

  if (scenes.length < 2) return <div className="v-splash">Tour ảnh chưa sẵn sàng.</div>
  return (
    <div className="v-tour">
      <TourPlayer
        scenes={scenes}
        autoplaySec={doc.tour?.autoplaySec ?? 4}
        onIndex={(i) => {
          onScene(scenes[i].id)
          events.tourScene?.(scenes[i].id)
          if (i === scenes.length - 1 && !completed.has(key)) {
            completed.add(key)
            events.tourComplete?.()
          }
        }}
        onSceneAction={(i, action) => {
          const s = raw.find((x) => x.id === scenes[i].id)
          if (s) onAction(s, action)
        }}
        extra={onLead && <button onClick={onLead}>Để lại SĐT để được tư vấn</button>}
      />
      {/* BR-T4: tour có clip AI phải ghi rõ */}
      {hasClipAi && <p className="v-tour-note">Chuyển cảnh minh hoạ do AI dựng</p>}
    </div>
  )
}
