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

---

# Lát R2 — Mô hình đồ chân thực

| | |
|---|---|
| SRS | FR-13.01–13.06, FR-13.16–13.17, FR-05.01, FR-06.08, BR-07, BR-R1–R4, BR-R6 · AC-R1–R4 |
| Last update | 2026-10-26 · Architect |

## R2.1 Mục tiêu
Một món trong thư viện đồ có **mô hình chân thực** và đi được qua quy trình:
1. Tải file GLB/glTF, FBX, OBJ (hoặc `.zip` chứa file kèm texture).
2. Hệ thống tự chuẩn hoá và sinh **bản đầy đủ** và **bản nhẹ**.
3. Người dựng khai nguồn & giấy phép, phạm vi.
4. QTV duyệt, rồi món mới dùng được trong mẫu nhà gửi duyệt.

Chưa làm trong R2: kho 60 món, bộ đồ, thay hàng loạt (R3); cổng khách (R4); AI (R5).

## R2.2 Xử lý mô hình (job `model.optimize`, worker thread)

| Bước | Cách làm |
|---|---|
| Đọc | `.glb`/`.gltf`: gltf-transform. `.fbx`/`.obj`: **assimpjs** (assimp WASM, MIT) chuyển sang GLB 2.0 trong bộ nhớ. `.zip` (fflate): giải nén vào thư mục tạm (≤ 300 tệp, ≤ 400 MB, chặn đường dẫn `..`), rồi chọn tệp chính theo thứ tự glb → gltf → fbx → obj |
| Đơn vị (BR-R4) | Hệ số thử: 1 (m), 0,01 (cm), 0,001 (mm), 0,0254 (inch). Có kích thước khai báo: chọn hệ số cho cạnh lớn nhất gần khai báo nhất. Không có: giữ 1 nếu cạnh lớn nhất nằm trong 0,05–8 m, còn không thì lấy hệ số đầu tiên đưa được về khoảng đó. Người dựng chọn tay được (`unit`) |
| Trục đứng | glTF mặc định Y lên trên. File từ 3ds Max/SketchUp hay dùng Z lên trên, và assimp không tự xoay. Có kích thước khai báo: so (R, C, S) của hai cách đặt, chọn cách lệch ít hơn. Không có: giữ Y. Chọn tay được (`upAxis` = y/z) |
| Gốc | Hộp bao về **giữa đáy** = (0, 0, 0); biến đổi được nướng vào đỉnh (`clearNodeTransform`) |
| Bản đầy đủ | Bỏ trùng, gộp, weld. Nếu > 50.000 tam giác: `simplify` meshoptimizer (sai số ≤ 1%). Texture webp ≤ 2.048 px. Nén meshopt |
| Bản nhẹ | Từ bản đầy đủ: `simplify` về 5.000 tam giác (sai số ≤ 5%), texture webp ≤ 512 px, nén meshopt |
| Đo | Kích thước đo được (mm) = hộp bao sau chuẩn hoá. Báo cáo cho cả 2 bản: tam giác, draw call, texture px lớn nhất, byte texture, byte file |

**Mức món (BR-R2), `ITEM_BUDGET` ở core:**

| Bản | Đạt | Chặn khi vượt (gấp đôi) |
|---|---|---|
| Đầy đủ | ≤ 50.000 tam giác, texture ≤ 2.048 px, ≤ 3 MB | > 100.000 tam giác hoặc > 6 MB |
| Nhẹ | ≤ 5.000 tam giác, texture ≤ 512 px, ≤ 300 KB | > 10.000 tam giác hoặc > 600 KB |

- Giữa hai mức: Cảnh báo.
- Vượt mức Chặn sau khi đã tự giảm: mô hình `failed`, thông báo nêu số liệu và cách làm nhẹ (EX-R1, AC-R2).
- Mô hình của tầng / cả nhà (có `project_id`) giữ quy trình cũ. Riêng phần chuyển FBX/OBJ dùng chung.

**Xử lý lại.** `POST /api/v1/models/:id/reprocess` nhận `{ unit?, upAxis?, declaredMm? }`, dùng khi tự nhận sai trục hoặc đơn vị.

## R2.3 Dữ liệu (migration 005)

| Bảng | Cột thêm |
|---|---|
| `library_items` | `product_code` · `source_kind` (free_library / ai / client_file / in_house, mặc định in_house) · `source_name` · `source_url` · `license` (cc0 / cc_by / commercial / client_exclusive) · `attribution` · `client_id` (null = kho chung) · `status` (draft / ready / retired, mặc định draft) · `approved_by` · `approved_at` |
| `model_assets` | `light_file_id` · `light_report_json` · `normalize_json` (yêu cầu: unit, upAxis, declaredMm → kết quả: hệ số, trục, định dạng gốc, `measuredMm`) |

- Đồ có sẵn được chuyển thành `in_house` · "Nhà mẫu online" · cc0 · ready, vì là khối dựng do đội làm.
- `files.kind` không đổi: bản nhẹ cũng là `model_optimized`.
- Down: `DROP COLUMN`.

## R2.4 API (mở rộng API-37…41)

| Endpoint | Thay đổi |
|---|---|
| `POST /library/models` | Nhận thêm `.fbx .obj .zip`, kèm trường form `unit`, `upAxis`, `declaredMm` ("R,C,S") |
| `GET /models/:id` | Thêm `lightUrl`, `lightReport`, `normalize`, `itemLevel` |
| `POST /models/:id/reprocess` | Mới (admin, producer; chỉ mô hình thư viện) |
| `GET /library/items?clientId=&all=1&status=` | Kho chung + của khách `clientId` (BR-R3); `all=1` chỉ cho admin; mặc định ẩn retired |
| `POST/PATCH /library/items` | Thêm: `productCode`, nguồn & giấy phép, `clientId` (chỉ admin gán), `acceptSizeMismatch`. Sửa mô hình, nguồn, giấy phép hoặc phạm vi của món ready thì món về draft. Mô hình lệch kích thước khai báo > 20% mà chưa chọn thì trả **422 `SIZE_MISMATCH`** (kèm `measuredMm`) |
| `POST /library/items/:id/approve` · `/retire` | Mới (admin). Thiếu nguồn hoặc giấy phép: **422 `LICENSE_INCOMPLETE`**. Mô hình còn đang xử lý hoặc lỗi: **422 `MODEL_NOT_READY`** |

- Item trả thêm `sizeDeviation` (lệch lớn nhất theo trục, %) và `clientName`.
- Lưu tài liệu: đồ thuộc khách khác dự án → `DOCUMENT_INVALID` (`library.<id>`: "Đồ thuộc khách hàng khác").

## R2.5 Core · kiểm gửi duyệt (FR-13.16, BR-07)
- `CheckContext.libraryStatus: Record<id, { name, status, clientId }>` + `clientId`. Thêm hai mã **block**:
  - `ITEM_NOT_READY`: món draft hoặc retired;
  - `ITEM_OTHER_CLIENT`: món thuộc khách khác.
- Ngân sách tầng tính hai lần:
  - **bản điện thoại**: báo cáo bản nhẹ của đồ, theo `BUDGET` hiện có (NFR-01);
  - **bản máy tính**: báo cáo bản đầy đủ, theo `BUDGET_DESKTOP`.

  `BUDGET_DESKTOP`:

  | Mức | Tam giác | Draw call | Texture | File |
  |---|---|---|---|---|
  | Cảnh báo | 1,5 triệu | 250 | 384 MB | 30 MB |
  | Chặn | 3 triệu | 400 | 768 MB | 45 MB |

  Thông báo ghi rõ "(bản điện thoại)" hoặc "(bản máy tính)".

## R2.6 Snapshot & trình xem
- `ResolvedLibraryItem` thêm: `modelLightUrl`, `productCode`, `clientName`, `credit { sourceName, sourceUrl, license, attribution }`.
- `ResolvedMaterial` thêm `credit`.
- `ResolvedModel` thêm `lightUrl?`.
- `publicResolved` bỏ báo cáo.
- Bản đã phát hành giữ đúng URL tại lúc duyệt (BR-R6, tệp đã nằm trong `submission_files`).
- **Tải dần (FR-13.01, 13.14):**
  - chất lượng Nhẹ chỉ tải bản nhẹ;
  - chất lượng Đẹp hiện khối, rồi bản nhẹ, rồi bản đầy đủ (Suspense lồng nhau). Bản nhẹ là chỗ đứng chờ của bản đầy đủ.
- **Đặt mô hình:** mô hình đã chuẩn hoá (giữa đáy, mét) được co giãn theo từng trục về đúng kích thước khai báo (BR-R4: kích thước khai báo là chuẩn). Mô hình cũ chưa chuẩn hoá giữ cách co cũ.
- **Bảng chi tiết đồ (FR-06.08):** mã sản phẩm; "Sản phẩm của <khách>"; ghi công nếu giấy phép cc_by hoặc có nội dung ghi công.
- **V7 "Nguồn đồ & vật liệu" (FR-13.17):** nút ở chân trang xem, mở bảng liệt kê đồ và vật liệu của mẫu nhà: tên, nguồn (có link), giấy phép, ghi công.

## R2.7 Studio
- **Thư viện đồ:**
  - lọc theo phạm vi và trạng thái;
  - thẻ đồ có huy hiệu Nháp / Sẵn dùng / Ngừng dùng và "3D";
  - form thêm: mã sản phẩm, nguồn & giấy phép, phạm vi (admin);
  - tải file 3D (GLB/FBX/OBJ/ZIP) kèm chọn đơn vị và trục (mặc định Tự nhận);
  - **khung xem 3D xoay 360°**, chuyển Đầy đủ / Nhẹ, bảng số liệu 2 bản kèm mức;
  - kích thước đo được so với khai báo: lệch 3–20% thì cảnh báo; lệch > 20% thì phải chọn "Co giãn theo khai báo" hoặc "Lấy kích thước mô hình";
  - nút "Chụp làm ảnh đại diện" (canvas → `library_image`): ảnh xem trước của FR-13.01, chụp trên trình duyệt vì máy chủ không có GPU;
  - QTV có nút Duyệt / Ngừng dùng.
- **Trình dựng:** danh sách đồ lấy theo khách của dự án (`clientId`). Món Nháp có huy hiệu và vẫn đặt thử được (FR-13.05).

## R2.8 Kiểm thử
- **core:** `itemLevel`, ngân sách hai bản, `ITEM_NOT_READY`, `ITEM_OTHER_CLIENT`.
- **api:**
  - OBJ đơn vị cm → đúng mét, gốc giữa đáy;
  - FBX trục Z và khai báo → đứng thẳng;
  - zip OBJ + MTL + texture;
  - lưới 120.000 tam giác → bản đầy đủ ≤ 50.000, bản nhẹ ≤ 5.000, mức Đạt (AC-R1);
  - 150.000 tam giác rời không giảm được → `failed` (AC-R2);
  - reprocess;
  - phạm vi danh sách (AC-R4); duyệt: `LICENSE_INCOMPLETE`;
  - chặn gửi duyệt khi đồ nháp (AC-R3); lưu tài liệu với đồ của khách khác bị từ chối;
  - `SIZE_MISMATCH`;
  - snapshot có `modelLightUrl` và `credit`.
- **web:** chọn bản tải theo chất lượng; co giãn theo trục.
- Chạy lại toàn bộ test, E2E, và bộ đi bộ (AC-R12).

## R2.9 Quyết định
- DEC-R14: chuyển FBX/OBJ bằng assimpjs (WASM, chạy trong worker, không cần cài thêm chương trình trên máy chủ và CI), thay cho FBX2glTF (bản chạy riêng theo hệ điều hành) và obj2gltf (chỉ OBJ).
- DEC-R15: tự nhận đơn vị và trục bằng hộp bao so với kích thước khai báo. Có chọn tay và Xử lý lại khi nhận sai.
- DEC-R16: ảnh xem trước chụp trong studio từ khung xem 3D, không render trên máy chủ.
- DEC-R17: `BUDGET_DESKTOP` cho bản máy tính (bảng ở R2.5). `BUDGET` hiện có áp cho bản điện thoại.
- DEC-R18: đồ có sẵn (khối dựng của đội) được chuyển sang ready · in_house · cc0, để mẫu nhà đang có không bị chặn gửi duyệt.
- DEC-R19: kích thước khai báo là chuẩn; trình xem co giãn từng trục mô hình đã chuẩn hoá. Lệch > 20% phải chọn, lưu ở cột `size_accepted`; đổi mô hình thì bỏ chọn.
