# Lát R1 — Vật liệu thật, ánh sáng tự nhiên, tải dần

> Item 03 "Đồ thật trong nhà 3D" · SRS `docs/ai/items/03-realistic-furniture/01-srs.md` (FR-13.04–13.05 phần vật liệu, FR-13.10–13.16) · Tech spec `02-tech-spec.md`

## TL;DR
- Trước đây sàn dùng texture vẽ bằng code, tường và trần một màu, ánh sáng là một nguồn chung. Nhìn giống mô hình, không giống nhà thật.
- Lát này thêm:
  - **thư viện vật liệu**: ảnh vân thật, đúng kích thước viên gạch và vân gỗ;
  - gán vật liệu cho **sàn, từng mặt tường, trần từng phòng**, cửa đi, bậc thang, mặt ngoài;
  - **nắng theo hướng nhà và giờ**, bầu trời, phản chiếu môi trường, bóng mềm;
  - **chọn chất lượng** Tự động / Nhẹ / Đẹp; ảnh vân tải dần 256 → 1024 px.
- Đồ vẫn là khối hình học. Đồ thật làm ở lát R2–R3.

## 1. Vì sao cần
Người mua nhìn 3D để hình dung "ở trong căn nhà này sẽ thế nào". Chất liệu sàn, màu tường và vệt nắng qua cửa sổ quyết định cảm giác đó nhiều hơn số lượng đồ. Vật liệu và ánh sáng làm trước vì cả 4 nhà mẫu và nhà của khách đều thấy khác ngay, không cần chờ có kho đồ.

## 2. Ai dùng, ở đâu
| Ai | Ở đâu | Làm gì |
|---|---|---|
| QTV, người dựng | Studio → **Vật liệu** | Thêm vật liệu, tải 3 ảnh vân (màu, pháp tuyến, độ nhám), khai nguồn & giấy phép; QTV **Duyệt** / **Ngừng dùng** |
| Người dựng | Trình dựng → tab **Vật liệu & ánh sáng** | Chọn phòng (bấm sàn trên 3D hoặc danh sách) → chọn vật liệu Sàn / Tường / Trần; "Gán mặc định theo công năng cho cả tầng"; vật liệu dùng chung (cửa, bậc thang, mặt ngoài); hướng Bắc, giờ nắng, cho bật Đêm |
| Người xem | Trang xem 3D | Thấy vật liệu thật; nút **Chất lượng** |

## 3. Quy tắc và lý do
| Quy tắc | Lý do | Code |
|---|---|---|
| Mỗi vật liệu phải có nguồn + giấy phép trước khi QTV duyệt; CC BY phải có ghi công; độc quyền của khách phải gắn khách (BR-R1) | Phát hành công khai cho khách hàng — tránh vi phạm bản quyền | `services/materials.ts` `approvalProblem` |
| Mẫu nhà dùng vật liệu chưa duyệt / ngừng dùng → **chặn gửi duyệt** `MATERIAL_NOT_READY`; vẫn lưu được để sửa dần | Chặn ở cửa phát hành, không chặn công việc dựng | `packages/core/src/rules.ts` |
| Vật liệu của khách A không dùng được trong dự án khách khác (BR-R3) | Sản phẩm, catalog của khách là của riêng họ | `routes/projects.ts` `validateRefs`, `repos.materials.list` |
| Sửa vật liệu đã duyệt → về Nháp, phải duyệt lại; bản đã phát hành không đổi (BR-R6) | Link khách đang chia sẻ không tự đổi | `routes/materials.ts`, snapshot |
| Ảnh vân lưu 2 cỡ 1024 + 256, xoay theo EXIF, bỏ metadata | Tải dần cho điện thoại; không lộ thông tin máy chụp | `saveTexture` |
| UV tính theo mét, repeat = 1 / kích thước ô vân | Gạch 600 × 600 hiện đúng 0,6 m trên mọi bức tường, mọi cỡ phòng | `scene/surfaces.ts` `meterBox` |
| Một đoạn tường chạy qua nhiều phòng được **chia theo phòng ở mỗi mặt** (lấy mẫu mỗi 200 mm) | Mặt tường trong WC là gạch men, mặt bên kia (phòng ngủ) là sơn — đúng như nhà thật | `scene/FloorGroup.tsx` `WallRun` |
| Trần chỉ hiện khi Đứng trong phòng ở tầng đang xem | Xem từ trên xuống không bị che | `RoomCeiling` |
| Hướng nắng: vĩ độ 16°B, ngày xuân phân; `northDeg` = hướng Bắc so với cạnh dưới mặt bằng (mặc định 180 = mặt tiền quay Nam) | Đơn giản mà đúng chiều: sáng nắng phía Đông, chiều phía Tây | `scene/sun.ts` |
| Chất lượng Tự động: máy cảm ứng / màn < 860 px / trình duyệt Zalo, Facebook → Nhẹ (ảnh 256, không bóng) | Giữ NFR-01 (≤ 5 s, ≤ 15 MB) trên điện thoại | `viewer/HousePage.tsx` |
| Tài liệu cũ không có vật liệu → hiển thị như trước | Không phải chuyển đổi dữ liệu | `RoomFloor`, `WallRun` |

## 4. Dữ liệu chuẩn
- **30 vật liệu chuẩn** (`apps/api/src/seed/materialCatalog.ts`, DEC-R7):
  - 20 vật liệu có ảnh vân **CC0 từ Poly Haven** (ảnh quét thật, kèm kích thước thật), tải sẵn vào `apps/api/src/seed/materials/` bằng `node scripts/fetch-materials.ts` (2,9 MB);
  - 8 màu sơn và 2 kim loại là vật liệu màu;
  - 1 gạch men ốp tường 300 × 600 sinh bằng code, vì kho không có gạch men ốp sạch.
- **Vật liệu mặc định theo công năng** (`packages/core/src/finishes.ts`). Ví dụ: phòng khách lát gỗ sồi, tường trắng ngà; WC lát granite xám, ốp gạch men trắng; phòng thờ lát gỗ óc chó, tường vàng kem.
- Seed và `--refresh-demo` gán mặc định này cho 4 nhà mẫu, kèm hướng nhà riêng từng căn.

## 5. Điểm dễ hiểu nhầm
- **Hướng Bắc** đo theo cạnh dưới của mặt bằng, không theo màn hình 3D. Trình dựng có la bàn và câu "Mặt tiền nhìn về hướng …".
- **"Không gán"** khác với "Sơn trắng": không gán thì dùng hiển thị cũ của hệ thống, nên không tính là vật liệu thật.
- Ảnh pháp tuyến phải theo chuẩn **OpenGL** (Poly Haven `nor_gl`). Dùng ảnh chuẩn DirectX thì gồ ghề bị ngược.

## 6. Bản đồ nghiệp vụ → code → test
| Nghiệp vụ | Code | Test |
|---|---|---|
| Thư viện vật liệu, ảnh 2 cỡ, giấy phép, phạm vi, snapshot công khai | `db/migrations/004_materials.sql`, `repos.materials`, `routes/materials.ts`, `services/materials.ts`, `services/snapshot.ts` | `apps/api/test/materials.test.ts` |
| Chặn gửi duyệt | `rules.ts` `MATERIAL_NOT_READY` | `packages/core/test/core.test.ts` |
| Dựng vật liệu, tường chia theo phòng, trần, cửa, bậc thang | `scene/surfaces.ts`, `scene/FloorGroup.tsx` | `apps/web/test/realism.test.ts` (UV theo mét) |
| Nắng, bầu trời, phản chiếu | `scene/sun.ts`, `HouseScene.tsx` `Lights`, `EnvironmentLight` | `realism.test.ts` (hướng nắng) |
| Trình dựng, studio | `editor/FinishTab.tsx`, `studio/Materials.tsx` | E2E chạy lại toàn bộ |
| Không làm hỏng đi bộ | — | `walk-physics.test.ts`, kịch bản trình duyệt |
