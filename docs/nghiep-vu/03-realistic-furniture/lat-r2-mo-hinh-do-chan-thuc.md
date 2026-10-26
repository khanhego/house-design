# Lát R2 — Mô hình đồ chân thực

> Item 03 "Đồ thật trong nhà 3D" · SRS `docs/ai/items/03-realistic-furniture/01-srs.md` (FR-13.01–13.06, FR-13.16–13.17, FR-05.01, FR-06.08, BR-07, BR-R1–R4) · Tech spec `02-tech-spec.md` phần R2

## TL;DR
- Trước đây mỗi món trong thư viện đồ chỉ gắn được một tệp GLB "dùng sao để vậy". Không ai biết mô hình lấy từ đâu, đơn vị nào, có nặng quá cho điện thoại không, có được phép dùng không.
- Lát này thêm cho mỗi món:
  - **nhập file 3D**: GLB, glTF, FBX, OBJ, hoặc `.zip` kèm ảnh texture;
  - **tự chuẩn hoá**: đơn vị về mét, đứng thẳng, gốc ở giữa đáy;
  - **hai bản**: bản đầy đủ cho máy tính, bản nhẹ cho điện thoại;
  - **đo kích thước**, so với kích thước khai báo;
  - **nguồn, giấy phép, phạm vi khách**, rồi **QTV duyệt**.
- Trình xem tải **khối → bản nhẹ → bản đầy đủ**, có trang **Nguồn đồ & vật liệu** liệt kê ghi công.
- Chưa có kho 60 món chuẩn và bộ đồ theo phong cách: làm ở lát R3.

## 1. Vì sao cần
Đồ khối hình học làm mẫu nhà trông như mô hình. Muốn thay bằng đồ thật thì phải nhận được file từ nhiều nguồn: kho miễn phí, đội tự làm, file của khách. Các file này rất khác nhau:
- 3ds Max xuất theo cm và trục Z hướng lên;
- Blender xuất theo mét và trục Y hướng lên;
- file khách thường nặng hàng trăm nghìn tam giác, ảnh texture 4K.

Nếu đưa thẳng vào mẫu nhà thì đồ sai cỡ, nằm ngửa, điện thoại tải không nổi. Ngoài ra, đồ hiện trên trang công khai của khách hàng, nên mỗi món phải rõ bản quyền.

## 2. Ai dùng, ở đâu
| Ai | Ở đâu | Làm gì |
|---|---|---|
| Người dựng | Studio → **Thư viện đồ** → Thêm / Sửa đồ | Nhập kích thước. Chọn đơn vị / trục (mặc định Tự nhận) và tải file. Xem mô hình xoay 360°, chuyển giữa bản Đầy đủ và Nhẹ, xem bảng số liệu. Xử lý lệch kích thước. "Chụp làm ảnh đại diện". Khai mã sản phẩm, nguồn & giấy phép |
| QTV | Như trên | Gán **phạm vi** (kho chung / của một khách), **Duyệt giấy phép**, **Ngừng dùng**; lọc theo phạm vi, trạng thái |
| Người dựng | Trình dựng → tab **Đồ** | Danh sách gồm kho chung và sản phẩm của khách dự án. Món "Nháp" vẫn đặt thử được |
| Người xem | Trang xem | Đồ thật tải dần. Chi tiết đồ hiện mã sản phẩm, "Sản phẩm của …" và ghi công. Chân trang có nút **Nguồn đồ & vật liệu** |

## 3. Quy tắc và lý do
| Quy tắc | Lý do | Code |
|---|---|---|
| **Đơn vị:** có kích thước khai báo thì chọn hệ số (m / cm / mm / inch) cho sai lệch nhỏ nhất. Không có thì đưa cạnh lớn nhất về 0,05–8 m (BR-R4) | Sofa đo ra "220 m" là file cm. Tự sửa và báo cho người dựng, không bắt họ đổi file | `jobs/modelOptimize.ts` `chooseFrame` |
| **Trục:** so cả hai cách đặt (Y lên / Z lên) với (rộng, cao, sâu) khai báo, chọn cách khớp hơn | assimp không tự xoay file 3ds Max; đoán sai thì đồ nằm ngửa | `chooseFrame`, `normalizeFrame` |
| **Gốc ở giữa đáy**, mọi biến đổi được nướng vào đỉnh | Đặt đồ trong mẫu nhà theo tâm và cao độ sàn, giống khối hình học cũ | `normalizeFrame` |
| **Bản đầy đủ** ≤ 50.000 tam giác, texture ≤ 2.048 px. **Bản nhẹ** ≤ 5.000 tam giác, ≤ 512 px. Vượt thì tự giảm. Sau khi giảm vẫn vượt gấp đôi thì **từ chối**, kèm số liệu và cách làm nhẹ (BR-R2) | Giữ NFR-01 trên điện thoại, đồng thời đủ đẹp trên máy tính | `ITEM_BUDGET`, `itemLevel` (core) · `modelJob.ts` |
| Ảnh texture không đọc được (EXR, TGA…) thì **bỏ** và cảnh báo. Ảnh tham chiếu không có trong tệp thì thay **ảnh trắng** và cảnh báo | File FBX của kho thường kèm EXR 5 MB không nén được. Đường dẫn ảnh trong MTL hay là ổ đĩa máy người dựng | `dropUnreadableTextures`, `modelImport.ts` `resolveAssimpGlb` |
| **Lệch kích thước:** ≤ 3% thì không báo. 3–20% thì cảnh báo. > 20% thì **bắt chọn** "Co giãn mô hình theo khai báo" hoặc "Lấy kích thước mô hình" (API trả `SIZE_MISMATCH`) | Kích thước khai báo là kích thước sản phẩm thật bán cho khách, nên là chuẩn. Lệch nhiều thường là chọn nhầm file | `routes/library.ts` `checkSize`, `sizeDeviation` |
| Trình xem **co giãn từng trục** mô hình đã chuẩn hoá về đúng kích thước khai báo. Mô hình cũ (trước R2) giữ cách co đều cũ | Lối đi, kiểm chặn cửa và va chạm người mẫu đều tính theo kích thước khai báo, nên hình phải khớp | `scene/Items.tsx` `fitToSize` |
| Mỗi món phải có **nguồn + giấy phép** (cc0, cc_by kèm ghi công, thương mại, độc quyền của khách kèm khách) mới được duyệt. Không có giấy phép phi thương mại (BR-R1) | Trang công khai là dùng thương mại | `services/materials.ts` `approvalProblem` (dùng chung với vật liệu) |
| Sửa mô hình, nguồn, giấy phép hoặc phạm vi của món đã duyệt → về **Nháp**. Sửa tên, mô tả thì không. Xử lý lại mô hình → Nháp, chọn lại cách xử lý lệch | Duyệt là duyệt bản quyền của đúng mô hình đó | `routes/library.ts` `REVIEWED`, `routes/models.ts` reprocess |
| Món Nháp / Ngừng dùng → **chặn gửi duyệt** `ITEM_NOT_READY`; vẫn đặt thử được | Như vật liệu: chặn ở cửa phát hành, không chặn công việc dựng | `packages/core/src/rules.ts` |
| Món của khách A: chỉ QTV gán; chỉ hiện khi dựng cho khách A; lưu vào nhà khách khác bị từ chối; gửi duyệt chặn `ITEM_OTHER_CLIENT` (BR-R3) | Sản phẩm của khách là của riêng họ | `repos.library.list`, `validateRefs`, `checkContext` |
| **Ngân sách hai bản:** điện thoại tính đồ theo bản nhẹ với `BUDGET` cũ; máy tính tính bản đầy đủ với `BUDGET_DESKTOP` (BR-07) | Người xem tải đúng bản theo thiết bị, nên phải kiểm đúng bản đó | `budgetForFloor(…, variant)`, `submitChecks` |
| **Tải dần:** Nhẹ chỉ tải bản nhẹ. Đẹp hiện khối, rồi bản nhẹ, rồi bản đầy đủ | Không có lúc trống; điện thoại không tải bản nặng | `Items.tsx` `modelUrls` |
| Bản đã phát hành giữ đúng tệp lúc duyệt (BR-R6) | Tệp bản nhẹ và bản đầy đủ vào `submission_files`; xử lý lại tạo tệp mới, không ghi đè | `services/snapshot.ts` |
| Ảnh đại diện **chụp trong studio** từ khung xem 3D | Máy chủ không có GPU để render | `studio/ModelPreview.tsx` |

## 4. Ví dụ
1. Người dựng nhận file `sofa.fbx` của Nội thất An Phát, xuất từ 3ds Max (cm, Z lên trên).
2. Họ nhập kích thước 2.000 × 900 × 850 rồi tải file. Khoảng 2 giây sau hệ thống báo:
   - tệp FBX · đơn vị cm · trục Z hướng lên;
   - đo được 2.000 × 900 × 850 mm;
   - ghi chú "Mô hình dùng trục Z hướng lên, đã xoay đứng lại".
3. Bảng số liệu: bản đầy đủ 48.200 tam giác, 2,4 MB → Đạt; bản nhẹ 4.900 tam giác, 260 KB → Đạt.
4. Người dựng khai mã AP-SF-220, nguồn "File của khách", giấy phép "Độc quyền của khách". QTV gán phạm vi "Của Nội thất An Phát" và duyệt.
5. Trong nhà của dự án An Phát, sofa có trong danh sách đồ. Dự án Sunrise Land không thấy sofa này.

Thử thật trên sofa_02 của Poly Haven (CC0):
- bản glTF trong `.zip`: 0,7 giây; 2.728 tam giác; bản đầy đủ 450 KB, bản nhẹ 72 KB;
- bản FBX: 1,6 giây; tự nhận đơn vị cm, bỏ ảnh normal EXR; bản nhẹ 38 KB.

## 5. Điểm dễ hiểu nhầm
- **Nhập kích thước trước khi tải file.** Không có kích thước, hệ thống không phân biệt được trục Z với trục Y và giữ trục Y. Nhận sai thì chọn trục rồi bấm **xử lý lại**, không cần tải lại file.
- **"Mức" của món khác "ngân sách tầng".** Mức món: một mô hình có quá nặng không. Ngân sách tầng: tổng mọi thứ người xem tải ở một tầng, kiểm khi gửi duyệt.
- **Đồ cũ (khối dựng)** đã được chuyển sang Sẵn dùng · Đội tự làm · CC0 (DEC-R18), nên mẫu nhà đang có không bị chặn.
- Mô hình của tầng / cả nhà (tab Mô hình trong trình dựng) **không** đi qua chuẩn hoá đồ. Chúng chỉ được nhận thêm định dạng FBX / OBJ / ZIP.

## 6. Bản đồ nghiệp vụ → code → test
| Nghiệp vụ | Code | Test |
|---|---|---|
| Đọc GLB / glTF / FBX / OBJ / ZIP | `jobs/modelImport.ts` (assimpjs, fflate) | `apps/api/test/realistic.test.ts` "xử lý mô hình đồ" |
| Chuẩn hoá, bản đầy đủ + bản nhẹ, mức món | `jobs/modelOptimize.ts` `optimizeItem`, `jobs/modelJob.ts` | như trên + "vượt mức Chặn" |
| Dữ liệu | `db/migrations/005_realistic_items.sql`, `repos.library`, `repos.models` | `realistic.test.ts` |
| API thư viện: phạm vi, duyệt, lệch kích thước, xử lý lại | `routes/library.ts`, `routes/models.ts` | `realistic.test.ts` "API thư viện đồ chân thực" |
| Chặn gửi duyệt, ngân sách hai bản | `packages/core/src/rules.ts` | `packages/core/test/core.test.ts` "đồ chân thực" |
| Snapshot: bản nhẹ, ghi công, sản phẩm của khách | `services/snapshot.ts` | `realistic.test.ts` (snapshot) |
| Trình xem: tải dần, co giãn theo trục, chi tiết đồ, Nguồn đồ & vật liệu | `scene/Items.tsx`, `viewer/ItemPanel.tsx`, `viewer/Credits.tsx` | `apps/web/test/realistic-items.test.ts` |
| Studio: thư viện đồ, khung xem 3D | `studio/Library.tsx`, `studio/ModelPreview.tsx` | kịch bản trình duyệt (tải sofa Poly Haven, duyệt, đặt vào trình dựng) |
