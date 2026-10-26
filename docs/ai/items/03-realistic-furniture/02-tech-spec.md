# Tech spec item 03 — Đồ thật trong nhà 3D · Lát R1 (vật liệu, ánh sáng, tải dần)

| | |
|---|---|
| SRS | `01-srs.md` v1.0 (G1 ✅) — lát R1: FR-13.10–13.15, FR-13.16 (phần vật liệu), FR-13.04–13.05 (phần vật liệu) |
| Trạng thái | Draft → dùng để implement R1; R2–R5 viết tiếp khi tới |
| Last update | 2026-10-26 · Architect |

## 1. Mục tiêu lát R1
Nhà trông thật hơn ngay cả khi đồ vẫn là khối hình học:
- sàn, tường từng mặt, trần, cửa, bậc thang có vật liệu ảnh thật (PBR, đúng kích thước viên/vân);
- nắng theo hướng nhà và giờ trong ngày, bầu trời, phản chiếu môi trường;
- người xem chọn được chất lượng, và trình xem tải dần.

## 2. Dữ liệu

**Vật liệu (bảng mới `materials`, migration 004)**

| Cột | Ý nghĩa |
|---|---|
| `id`, `key` (duy nhất, kebab) | `key` ổn định, để seed / mặc định tham chiếu |
| `name`, `category` | wood · tile · stone · concrete · paint · plaster · brick · metal · fabric · other |
| `tile_w_mm`, `tile_h_mm` | Kích thước thật một ô vân (FR-13.10) |
| `color`, `roughness`, `metalness` | Vật liệu màu dùng trực tiếp. Vật liệu có ảnh: màu trung bình, hiện khi ảnh chưa tải |
| `color_file_id`, `normal_file_id`, `rough_file_id` (+ `_small_`) | Ảnh vân, mỗi ảnh 2 cỡ: 1024 và 256 (tải dần). Tệp loại mới `material_texture` (công khai sau phát hành) |
| `source_kind` | free_library · ai · client_file · in_house |
| `source_name`, `source_url`, `license`, `attribution` | license: cc0 · cc_by · commercial · client_exclusive (BR-R1) |
| `client_id` | null = kho chung; có = của khách đó (BR-R3) |
| `status` | draft · ready · retired. QTV duyệt draft → ready (FR-13.05) |
| `approved_by`, `approved_at`, `created_at`, `updated_at` | |

Bảng `files`: dựng lại để CHECK có thêm `material_texture` (giống migration 002).

**Tài liệu mẫu nhà (HouseDocument, thêm trường tuỳ chọn, không đổi `schemaVersion`)**
- `Room.finish?: { floor?, wall?, ceiling? }`: id vật liệu.
- `HouseDocument.finishes?: { door?, stair?, facade? }`: cửa đi, bậc thang, mặt ngoài tường bao.
- `HouseDocument.lighting`: thêm `northDeg?` (0–359, hướng Bắc so với trục −y của mặt bằng, mặc định 180 = nhà quay hướng Nam, BR-R7) và `hour?` (6–18, mặc định 9).
- Thiếu `finish` thì trình xem giữ cách hiển thị cũ (texture vẽ bằng code), nên tài liệu cũ không phải chuyển đổi.

**Snapshot.** `resolved.materials?: Record<id, ResolvedMaterial>` gồm thông số và URL ảnh hai cỡ. Ảnh được ghi vào `submission_files`, nên tự công khai khi phát hành.

## 3. API

| ID | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| API-M1 | `GET /api/v1/materials?clientId=` | admin, producer | Kho chung + của khách `clientId`; mặc định không gồm retired |
| API-M2 | `POST /api/v1/materials` | admin, producer | Tạo draft: thông số + nguồn & giấy phép + phạm vi |
| API-M3 | `PATCH /api/v1/materials/:id` | admin, producer | Sửa; sửa vật liệu đã ready → quay lại draft (phải duyệt lại) |
| API-M4 | `POST /api/v1/materials/:id/textures` (multipart: `map` = color/normal/rough, `file`) | admin, producer | sharp: xoay theo EXIF, bỏ metadata, 1024 + 256 JPEG; ≤ 20 MB, ≤ 60 MP |
| API-M5 | `POST /api/v1/materials/:id/approve` · `/retire` | admin | ready khi đủ nguồn + giấy phép (+ ghi công nếu cc_by) |

Lưu tài liệu (`PUT …/document`): mọi id vật liệu phải tồn tại, chưa retired, thuộc kho chung hoặc đúng khách của dự án (VALIDATION).

`submitChecks`: vật liệu được dùng mà chưa ready thì báo **block** `MATERIAL_NOT_READY` (FR-13.16).

## 4. Trình xem 3D
- **Vật liệu:** `MeshStandardMaterial` (map, normalMap, roughnessMap), dùng chung theo (id, chất lượng). UV tính theo mét trên mọi bề mặt (sàn: toạ độ mặt bằng; hộp tường: nhân theo kích thước từng mặt), nên `repeat = 1 / tile_m` đúng kích thước thật.
- **Tường:** mỗi đoạn là hộp có mảng 6 vật liệu. Mặt ±z (pháp tuyến n của tường) lấy `finish.wall` của phòng nằm phía đó, xác định bằng điểm cách mặt tường 150 mm. Không có phòng thì dùng `finishes.facade`.
- **Trần:** mỗi phòng một mặt trần ở `elevation + height`. Chỉ hiện ở tầng đang xem khi đang Đứng trong phòng; xem từ trên xuống thì không che.
- **Ánh sáng:**
  - mặt trời: hướng tính từ `northDeg` và `hour` (vĩ độ 16°B, giữa năm, đơn giản hoá), là directional light có bóng, cường độ giảm lúc sáng sớm và chiều muộn;
  - bầu trời `Sky` (drei) cùng hướng mặt trời;
  - phản chiếu môi trường: `RoomEnvironment` (three, không cần tải file);
  - ánh sáng bù: hemisphere;
  - Đêm: như cũ, có đèn phòng.
- **Chất lượng (FR-13.15):**
  - Tự động: máy yếu, cảm ứng hoặc trình duyệt trong Zalo/Facebook thì dùng Nhẹ; còn lại dùng Đẹp;
  - Nhẹ: ảnh 256, không bóng đổ;
  - Đẹp: ảnh 256 trước rồi đổi sang 1024 khi tải xong (FR-13.14), bóng 2048.

  Lựa chọn nhớ trong `localStorage`.
- **Tải dần:** ảnh 256 (≈ 20 KB/ảnh) tải cùng mẫu nhà. Ảnh 1024 chỉ tải cho vật liệu của tầng đang xem.

## 5. Trình dựng & studio
- **A3 tab "Vật liệu":**
  - chọn phòng, rồi chọn vật liệu cho Sàn / Tường / Trần (lưới có ảnh mẫu);
  - "Áp mặc định theo công năng" cho cả tầng;
  - vật liệu dùng chung: cửa, bậc thang, mặt ngoài.
- **A3 tab "Ánh sáng":** hướng nhà (0–359°, hiện hướng Bắc), giờ (6–18), Đêm.
- **Studio "Vật liệu"** (màn mới): lưới vật liệu, lọc theo loại và trạng thái; thêm, sửa; tải 3 ảnh vân; nguồn & giấy phép; phạm vi; QTV Duyệt / Ngừng dùng.

## 6. Seed & demo
- `seed/materialCatalog.ts`: 30 vật liệu chuẩn (DEC-R7), ảnh CC0 Poly Haven tải sẵn ở `seed/materials/` bằng `scripts/fetch-materials.ts`.
- Seed nhập vật liệu (ready, duyệt bởi admin). Nhà mẫu được gán vật liệu mặc định theo công năng, mặt ngoài, cửa, cầu thang, và hướng nhà.
- `--refresh-demo` cập nhật nhà mẫu đã phát hành.

## 7. Kiểm thử
- **core:** schema (finish, lighting), `materialIds`, `MATERIAL_NOT_READY`.
- **api:** API-M1…M5 (quyền, phạm vi khách, ảnh 2 cỡ), kiểm tham chiếu khi lưu tài liệu, snapshot có vật liệu và tệp công khai, nhà mẫu có vật liệu.
- **web:** UV theo mét, chọn vật liệu mặt tường theo phòng, hướng mặt trời.
- **E2E:** chạy lại toàn bộ; bộ đi bộ vật lý (AC-R12) vẫn đạt.

## 8. Quyết định (ghi DEC trong 00-status)
- DEC-R9: tải sẵn ảnh CC0 vào repo (2,9 MB) thay vì tải lúc seed, để CI và bản demo tĩnh chạy không cần mạng.
- DEC-R10: vật liệu là bảng riêng (không trộn vào thư viện đồ); id vật liệu lưu trong tài liệu; thiếu thì giữ hiển thị cũ.
- DEC-R11: ánh sáng môi trường dùng RoomEnvironment (không tải HDRI) ở R1, để nhẹ cho điện thoại.
