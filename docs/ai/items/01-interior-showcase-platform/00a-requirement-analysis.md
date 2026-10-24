# Phân tích yêu cầu thô — Giải pháp chuyển đổi quảng cáo nhà sang 3D + bản vẽ kỹ thuật

| | |
|---|---|
| Phiên bản | 0.2 — viết lại theo mô hình kinh doanh đúng (DEC-3) |
| Trạng thái | Draft |
| Owner (PO) | khanhtt |
| Nguồn | Yêu cầu của user ngày 2026-10-24 (trích nguyên văn bên dưới) + prototype `src/` |
| Last update | 2026-10-24 · PO |

> **TL;DR** — User là **đơn vị cung cấp giải pháp và triển khai**, không làm tool tự phục vụ cạnh tranh với Coohom/Homestyler.
> User bán cho **bên bán nhà có thiết kế**: chủ đầu tư/sàn BĐS, công ty xây nhà trọn gói, công ty thiết kế–thi công nội thất.
> **Đội của user** chuyển tài liệu quảng cáo sẵn có của khách (ảnh, PDF mặt bằng, CAD/SketchUp) thành **trang xem 3D tương tác + bản vẽ kỹ thuật**, mang thương hiệu khách. Trang dùng để quảng cáo và thu khách hàng tiềm năng.
> Nền tảng gồm 3 phần: **công cụ sản xuất nội bộ** (cho đội user), **trang xem công khai** (cho người mua nhà), **trang quản trị nhẹ** (cho khách của user).
> **Bản vẽ kỹ thuật là xương sống công nghệ.** Phần tính giá theo đồ làm sau MVP.

---

## 1. Yêu cầu thô

| Ngày | Nguyên văn | Ghi chú |
|---|---|---|
| 2026-10-24 (1) | "T muốn build website quảng cáo nội thất, khách có thể vào và preview chi tiết nội thất trong nhà. Có thể chọn nhà, xoay 3d, …" | → prototype `src/` |
| 2026-10-24 (2) | "T muốn build 1 platform, có thể bán cho các doanh nghiệp thiết kế nội thất. Mục tiêu để họ show được nhà, thiết kế của họ cho khách hàng dưới dạng 3D và bản thiết kế kĩ thuật chuẩn" | |
| 2026-10-24 (3) | "T là đơn vị bán và triển khai sản phẩm này đến cho các bên bán nhà có thiết kế. Ví dụ t đến với khách: em có thể chuyển đổi cho anh từ việc quảng cáo cơ bản sang thành mô hình 3D … Chứ không phải t định làm tool cạnh tranh với các bên" | **Làm rõ mô hình kinh doanh** — thay thế cách hiểu ở bản 0.1 |

**Tách thành các mệnh đề:**

| # | Mệnh đề | Diễn giải |
|---|---|---|
| R1 | "đơn vị bán và triển khai" | Mô hình **dịch vụ + nền tảng của mình**: đội user dựng nội dung, vận hành nền tảng, thu phí dựng + phí duy trì (user chọn 2026-10-24) |
| R2 | "các bên bán nhà có thiết kế" | 3 nhóm khách: chủ đầu tư/sàn BĐS dự án · công ty xây nhà trọn gói/nhà mẫu · công ty thiết kế–thi công nội thất (user chọn) |
| R3 | "từ quảng cáo cơ bản sang mô hình 3D" | Đầu vào là tài liệu sẵn có của khách: phối cảnh, brochure, PDF mặt bằng, file CAD/SketchUp. Đầu ra là trải nghiệm 3D tương tác |
| R4 | "bản thiết kế kỹ thuật chuẩn" | Mặt bằng có kích thước, bố trí nội thất, trần/điện — trình bày theo TCVN. Là **xương sống công nghệ** (user chốt) |
| R5 | "cho khách hàng" (của khách) | Người mua nhà: xem trên điện thoại, qua link/Zalo/website, không cài app, không tạo tài khoản |
| R6 | Mục đích là **quảng cáo** | Trang xem phải phục vụ bán hàng: thương hiệu khách, nhúng website, thu thông tin người quan tâm (lead) |

## 2. Các bên tham gia

| Lớp | Là ai | Việc cần làm | Thành công khi |
|---|---|---|---|
| **Đơn vị cung cấp** (user) | Đội kinh doanh + đội dựng mô hình của user | Bán gói; dựng mô hình nhanh, đúng; vận hành và bàn giao | Thời gian/chi phí dựng mỗi dự án thấp; khách gia hạn |
| **Khách hàng** (bên bán nhà) | Marketing / kinh doanh của chủ đầu tư, công ty xây nhà, công ty nội thất | Có công cụ quảng cáo nổi bật hơn ảnh tĩnh; gửi link cho người mua; biết ai quan tâm | Thêm lead, lead chất lượng hơn, chốt nhanh hơn, tốn ít hơn nhà mẫu thật |
| **Người xem** | Người mua nhà, chủ đất, chủ căn hộ | Hiểu nhà trông thế nào, kích thước ra sao, bố trí được gì | Mở link là xem được, dễ hiểu, liên hệ được ngay |

## 3. Việc nền tảng phải làm (jobs)

| ID | Job | Ai dùng | MVP? | Ghi chú |
|---|---|---|:---:|---|
| J1 | Nhận và lưu tài liệu đầu vào của khách theo dự án | Đội user | ✔ | Ảnh, PDF, DXF, GLB |
| J2 | **Dựng khung ngữ nghĩa**: tường, phòng, cửa, cao độ — can trên ảnh/PDF/DXF mặt bằng | Đội user | ✔ | Công cụ nội bộ; quyết định Q1 = lai |
| J3 | Đưa mô hình 3D vào (GLB từ SketchUp/3ds Max) và đặt/gắn nhãn đồ nội thất | Đội user | ✔ | Pipeline tối ưu cho mobile |
| J4 | **Tự sinh bản vẽ kỹ thuật** từ khung ngữ nghĩa: mặt bằng kích thước, bố trí nội thất, trần/điện; khung tên & nét theo TCVN; xuất PDF/DXF | Hệ thống | ✔ | Xương sống công nghệ (user chốt) |
| J5 | Đính kèm bản vẽ không tự sinh (mặt cắt, chi tiết đồ gỗ) dạng PDF/DXF | Đội user | ✔ | Q2 = tự sinh cơ bản + đính kèm |
| J6 | **Trang xem công khai**: 3D (xoay, phòng, đứng trong phòng, bấm đồ xem chi tiết) + tab bản vẽ, mang thương hiệu khách | Người xem | ✔ | Prototype đã chứng minh phần 3D |
| J7 | Chia sẻ: link, mã QR, nhúng iframe vào website khách | Khách hàng | ✔ | |
| J8 | Thu lead: form liên hệ / gọi / Zalo trên trang xem | Người xem → khách hàng | ? | Cần cho mục đích quảng cáo — chờ research xác nhận mức ưu tiên |
| J9 | Trang quản trị nhẹ cho khách: xem dự án, thống kê lượt xem, danh sách lead | Khách hàng | ? | |
| J10 | Quản lý khách hàng, dự án, gói dịch vụ, trạng thái sản xuất (nội bộ) | Đội user | ✔ | Tối thiểu |
| J11 | Báo giá theo đồ, đổi biến thể ra giá | Người xem | ✗ sau MVP | User chốt: làm sau MVP |
| J12 | Khách hàng tự cập nhật / tự dựng | Khách hàng | ✗ | Có thể mở ở giai đoạn sau |

## 4. Quyết định đã chốt

| DEC | Nội dung | Ngày |
|---|---|---|
| DEC-3 | Mô hình kinh doanh: **dịch vụ + nền tảng của user**, không làm tool tự phục vụ. Khách hàng: chủ đầu tư/sàn BĐS · công ty xây nhà trọn gói · công ty thiết kế–thi công nội thất | 2026-10-24 |
| DEC-4 | Q1 — Đưa thiết kế vào bằng **mô hình lai**: dựng khung ngữ nghĩa trên web + upload GLB. Người thao tác là **đội user** | 2026-10-24 |
| DEC-5 | Q2 — Bản vẽ: **tự sinh** phần cơ bản (mặt bằng kích thước, bố trí, trần/điện) theo TCVN, xuất PDF/DXF; **đính kèm** mặt cắt/chi tiết | 2026-10-24 |
| DEC-6 | Phạm vi: **bản vẽ là xương sống công nghệ**; báo giá theo đồ làm sau MVP | 2026-10-24 |

## 5. Giả thuyết cần research kiểm (thay bản 0.1)

| ID | Giả thuyết |
|---|---|
| H1 | Bên bán nhà ở VN đang quảng cáo chủ yếu bằng phối cảnh tĩnh, phim 3D, nhà mẫu thật; một phần đã dùng VR360/sa bàn số |
| H2 | Các đơn vị VR360/sa bàn số/archviz ở VN chưa giao **bản vẽ kỹ thuật** và **bấm vào đồ xem chi tiết** trong cùng trải nghiệm |
| H3 | Khách trả theo dự án/mẫu căn + phí duy trì; có mốc giá tham chiếu (tour VR360, phim 3D, nhà mẫu thật) |
| H4 | Bản vẽ có kích thước giúp người mua tin tưởng và giúp sales trả lời câu hỏi "phòng rộng bao nhiêu, kê được gì" |
| H5 | Chi phí sản xuất mỗi dự án đủ thấp để có lãi nhờ công cụ nội bộ + thư viện đồ dùng lại |

## 6. Câu hỏi còn mở

| # | Câu hỏi | Ảnh hưởng | Trả lời bằng |
|---|---|---|---|
| Q8 | Nhóm khách đầu tiên để tập trung (trong 3 nhóm)? | Thứ tự tính năng (unit selector cho dự án vs mẫu nhà vs portfolio) | Research → user |
| Q9 | Thu lead (J8) và trang quản trị khách (J9) có vào MVP không? | Phạm vi BE | Research → user |
| Q10 | Mục tiêu thời gian dựng một mẫu căn (vd ≤ 2 ngày công)? | NFR cho công cụ nội bộ | User |
| Q11 | Thời gian ra MVP, ngân sách hạ tầng? | Cắt phạm vi | User |

## 7. Bài học từ prototype (`src/`)

| Đã chứng minh | Chưa chứng minh |
|---|---|
| Xem 3D mượt trên web/mobile với cảnh đơn giản | Hiệu năng với GLB thật từ SketchUp/3ds Max |
| Từ mô hình ngữ nghĩa sinh được tường 3D **và** mặt bằng 2D (`src/three/Structure.tsx`, `src/components/FloorPlan.tsx`) — đúng hướng DEC-4/DEC-5 | Bản vẽ có kích thước, ký hiệu, khung tên, xuất PDF/DXF |
| Bấm đồ → chi tiết, đổi màu; cắt tường, đứng trong phòng, ngày/đêm | Công cụ dựng khung cho đội nội bộ (hiện dữ liệu viết tay trong code) |
