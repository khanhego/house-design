# Tech spec — 02 Tham quan ảnh thật

| | |
|---|---|
| Phiên bản | 1.0 — Approved (agent, quy mô S: gộp 02 + 02a + 02b) |
| SRS | `01-srs.md` v1.0 (G1 ✅, Q-1 = A + C) |
| Last update | 2026-10-24 · Architect |

## 1. Tóm tắt
Thêm `tour` vào tài liệu mẫu nhà (`HouseDocument`, ADR-001): cùng vòng đời phiên bản, snapshot, duyệt, phát hành như phần 3D. **Không tạo bảng mới.** Ảnh tour được xử lý ở server (xoay theo EXIF, thu về 2 cỡ WebP, xoá metadata), không lưu ảnh gốc. Clip chuyển cảnh là tệp MP4 tải lên theo cặp cảnh. Trình xem là một component React thuần DOM/CSS (không cần WebGL), dùng chung cho V6, C3 và xem thử ở A7.

## 2. Dữ liệu (core `schema.ts`)

```ts
TourScene = {
  id, fileId,                 // ảnh 2560 px (kind tour_image)
  smallFileId,                // ảnh 1280 px (kind tour_image)
  title: string(1..80), description?: string(≤300), highlights: string[≤3, mỗi ≤60],
  next?: [x, y] ∈ [0,1]²,      // điểm đi tiếp (tỷ lệ trên ảnh)
  floorId?, roomId?,          // liên kết phòng 3D
  clipFileId?, clipSource?: 'upload' | 'ai'   // clip từ cảnh này sang cảnh kế
}
Tour = { autoplaySec: 2..15 (mặc định 4), scenes: TourScene[0..60] }
HouseDocument.tour?: Tour
```
- `validateRefs` (API-35): fileId/smallFileId phải là `tour_image` của dự án; `clipFileId` là `tour_clip`; floorId/roomId tồn tại. `coverFileId` nhận thêm `tour_image` (dùng ảnh cảnh làm ảnh đại diện).
- Snapshot: `resolved.files` thêm URL ảnh/clip tour; `storageKeys` cho phép kind `tour_image`, `tour_clip`.

**Kiểm gửi duyệt (`submitChecks`)**
| Mã | Mức | Điều kiện |
|---|---|---|
| `NO_CONTENT` (thay `NO_FLOORS`) | block | Không có tầng có nội dung (tường/phòng/mô hình) **và** không có tour |
| `TOUR_TOO_SHORT` | block | Có tour nhưng < 2 cảnh |
| `TOUR_NO_NEXT` | warn | Cảnh (trừ cảnh cuối) chưa có điểm đi tiếp |
| Kiểm tầng (hiệu chỉnh, phòng khép, lối đi…) | như cũ | Chỉ với tầng có nội dung; tầng rỗng bị bỏ qua khi có tour |

Hàm dùng chung: `hasModel3d(doc)` = có tầng có tường/phòng/mô hình hoặc `wholeModel`; `hasTour(doc)` = tour ≥ 2 cảnh.

## 3. API

| ID | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| API-24 | `POST /projects/:id/tour-images` (multipart, 1 tệp) | JPG/PNG/WebP ≤ 25 MB. `sharp().rotate()` → 2560 px WebP q82 + 1280 px WebP q78, xoá metadata. Trả `{ image: {id,url,width,height}, small: {id,url}, takenAt? }` (`takenAt` đọc EXIF DateTimeOriginal trước khi xoá — để xếp thứ tự EX-T2). HEIC/HEIF → 415 `UNSUPPORTED_FILE` "Ảnh HEIC chưa hỗ trợ — xuất JPG rồi tải lại" | A, P |
| API-23 (mở rộng) | `POST /files` kind `tour_clip` | MP4 ≤ 20 MB (giới hạn theo kind) | A, P |
| API-63 (mở rộng) | sự kiện `tour_open`, `tour_scene` (targetId = scene id), `tour_complete` | | công khai |
| API-62 (mở rộng) | `context.sceneId` → lưu `sceneName` (lấy từ bản phát hành) | | công khai |
| API-80 (mở rộng) | `topScenes: [{ name, views }]` | | A, R |
| API-60 (mở rộng) | thẻ mẫu nhà thêm `modes: ('3d' | 'tour')[]` | | công khai |

Tệp: kind mới `tour_image`, `tour_clip`. `files.kind` có ràng buộc CHECK → **migration 002 dựng lại bảng `files`** (chép nguyên dữ liệu; không bảng nào có khoá ngoại tới `files`). Rollback `002_tour_files.down.sql` xoá dòng tệp tour nhưng **không** xoá tệp trên đĩa và không sửa tài liệu đang trỏ tới — chỉ rollback khi chưa có tour nào được dựng. Quyền đọc theo §6.2 như ảnh cover/gallery.

Clip `tour_clip` (API-23): sau khi nhận, server kiểm hộp đầu `ftyp` + có `moov` (không thì 415), rồi đổi các hộp `udta`/`meta`/`uuid` thành `free` và ghi 0 nội dung (giữ kích thước → offset không đổi) — `apps/api/src/lib/mp4.ts`. Ảnh tour: một lần giải mã sharp, `limitInputPixels` 60 Mpx, giờ chụp từ EXIF DateTimeOriginal (0x9003) — `lib/exif.ts`.

## 4. Web

| Thành phần | Vị trí | Ghi chú |
|---|---|---|
| `TourPlayer` | `src/tour/TourPlayer.tsx` | Hai lớp ảnh A/B, Web Animations API: Tiếp = A phóng ×2,2 quanh `next` + mờ, B thu từ ×1,35 về 1 + hiện (1,1 s); Lùi = ngược. Có clip → phát `<video>` muted playsinline rồi hiện B. `prefers-reduced-motion` / máy yếu → mờ dần 300 ms. Tải trước n+1, n+2, n−1; Tiếp chờ ảnh tải (EX-T6). Phím ←/→, vuốt (Pointer Events, ngưỡng 50 px), chấm tiến độ, Tự chạy, toàn màn hình, màn kết |
| `tour/order.ts` | | Sắp tệp theo số đầu tên → `takenAt` → thứ tự chọn; tên cảnh từ tên tệp |
| V6 | `viewer/HousePage.tsx` tab "Ảnh thật" | Mặc định mở tab này khi `!hasModel3d`; ẩn 3D/Mặt bằng khi không có 3D; lead kèm `sceneId`; sự kiện tour; không cần WebGL (V4 dự phòng hiện tour) |
| A7 | `app/studio/editor/TourTab.tsx` | Kéo thả nhiều ảnh (tải tuần tự, tiến độ), dải ảnh kéo đổi thứ tự (BR-T3 gỡ clip cặp bị ảnh hưởng), ảnh lớn bấm đặt điểm đi tiếp, trường cảnh, chọn tầng/phòng, clip cho cặp (kiểm thời lượng ≤ 15 s bằng `<video>` metadata), xem thử cặp / cả tour (`TourPlayer`), "Dùng ảnh cảnh 1 làm ảnh đại diện", panel kịch bản chụp + tải PDF (jsPDF + font Be Vietnam Pro) |
| V1 | `ProjectPage.tsx` | Nhãn "3D" / "Ảnh thật" trên thẻ |

## 5. Phương án đã cân nhắc
| Phương án | Bỏ vì |
|---|---|
| Bảng `tour_scenes` riêng | Mất tính bất biến theo phiên bản/snapshot; phải nhân đôi luồng duyệt |
| Chuyển cảnh bằng WebGL (depth map, parallax) | Cần ước lượng độ sâu (AI) — để Phase 2 cùng FR-12.14 |
| Lưu ảnh gốc | Không cần cho hiển thị; tăng dung lượng; rủi ro lộ EXIF/GPS (BR-T5) |

## 6. Kế hoạch (03)
| Task | Nội dung | Comp. |
|---|---|---|
| T2-1 | core: schema tour, `hasModel3d/hasTour`, kiểm gửi duyệt, test | core |
| T2-2 | api: API-24 xử lý ảnh, kind `tour_clip`, validateRefs, snapshot, lead `sceneId`, sự kiện + topScenes, `modes` — test | be |
| T2-3 | web: `TourPlayer` + `order.ts` + test | fe |
| T2-4 | web: V6 trong HousePage, V1 nhãn, V4 | fe |
| T2-5 | web: A7 TourTab + kịch bản chụp PDF | fe |
| T2-6 | E2E-03 (tải ảnh → điểm đi tiếp → duyệt → phát hành → Tiếp/Lùi → lead có cảnh) + tour mẫu trong seed | fe+be |

## 7. Kiểm thử
AC-T1…T7 của SRS → test: core (kiểm gửi duyệt), api (ảnh ra WebP 2 cỡ, không còn EXIF — AC-T6; tour-only phát hành — AC-T4; lead có cảnh — AC-T5), web unit (`order.ts` — AC-T1), E2E-03 (AC-T2, T3, T4, T5), kiểm tay vuốt / giảm chuyển động (AC-T7).
