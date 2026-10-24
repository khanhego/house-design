# 01-interior-showcase-platform — Plan

| | |
|---|---|
| Owner (PM) | Agent (DEC-16) |
| Reviewer | — (quy mô S, tự soát) |
| Trạng thái | Approved (Plan ✅ 2026-10-24 · agent, DEC-35) |
| Spec | [02](02-tech-spec.md) · [02a](02a-be-spec.md) · [02b](02b-fe-spec-web.md) |
| Last update | 2026-10-24 · PM |

> **TL;DR**
> - 30 task (BE 13, FE 17), chia thành 5 lát dọc. Tổng ước lượng khoảng 30 ngày công cho 1 người.
> - Đường găng: core → API khung → mô hình dữ liệu và snapshot → trang xem → trình dựng → duyệt/phát hành → lead/thống kê.
> - Mỗi lát kết thúc bằng một bản demo chạy được.
> - Rủi ro tiến độ lớn nhất là trình dựng A3 (F11–F13) và spike GLB (B6).

---

## 1. Chiến lược chia
Chia **lát dọc theo giá trị**, theo thứ tự SRS RK-04: xem 3D đa tầng → trình dựng → duyệt/phát hành → lead → thống kê.

Lát 1 dùng **dữ liệu seed đã phát hành sẵn** (service gọi trực tiếp, không qua UI duyệt). Nhờ vậy trang xem, phần giá trị chính khi đi bán, demo được sớm nhất.

Task BE nào các lát sau mới cần (auth, workflow API) thì đặt ở lát đó.

## 2. Task

| T | Tên | Comp | Phủ | Nguồn | Phụ thuộc | Ước lượng | Trạng thái |
|---|---|:---:|---|---|---|---|:---:|
| **Lát 1 — Xem 3D đa loại nhà + mặt bằng** |||||||
| T-1 | Monorepo + `core` schema/geometry/rules + test | be | 02 §5, BR-04/05/07/09 | 02a B1 | — | 1 | ✅ |
| T-2 | `core.planSvg` + dimensions + escape + test | be | FR-07.01–02 | 02a B2 | T-1 | 1 | ✅ |
| T-3 | API khung: server, config, db + migration + trigger, errors, storage, healthz, phục vụ web + CSP + dev proxy | be | NFR-05/06 | 02a B3 | T-1 | 1 | ✅ |
| T-4 | Chuyển prototype vào `apps/web`; Vite multi-page; `lib/api.ts`; i18n; theme | fe | — | 02b F1 | T-1 | 0,5 | ✅ |
| T-5 | Repo + service projects/houses/versions/library/files (chưa route quản trị) + snapshot.build + publish service + fileAccess | be | FR-01.03, 08.06, BR-01/02 | 02a B5, B7, B8 (phần service) | T-3 | 1,5 | ✅ |
| T-6 | Public API + `/files` + availability + OG + form token | be | API-60, 61, BR-08 | 02a B9 | T-5 | 0,5 | ✅ |
| T-7 | Seed 4 mẫu nhà AC-01 (căn hộ 2PN, nhà phố 4 tầng có lửng + sân thượng, biệt thự 3 tầng + sân vườn + hồ bơi, nhà cấp 4) — phát hành sẵn | be | AC-01 | 02a B12 | T-5 | 0,5 | ✅ |
| T-8 | Cảnh 3D đa tầng từ `HouseDocument` | fe | FR-04.04, 06.02–06.07 | 02b F2 | T-2, T-6 | 2 | ✅ |
| T-9 | V1 + V2 shell + V4 (panels, chế độ, mobile, chia sẻ, deep link, miễn trừ, branding) | fe | FR-06.*, 09.01 | 02b F3 | T-8 | 1,5 | ✅ |
| T-10 | Tab Mặt bằng + PDF (font VN, dự phòng in-app) | fe | FR-07.01–04 | 02b F4 | T-9 | 1 | ✅ |
| **Lát 2 — Công cụ nội bộ & trình dựng** |||||||
| T-11 | Auth + users + clients + thu hồi phiên + outbox/transport + E1/E2 | be | API-01…05, 10…13 | 02a B4 | T-3 | 1 | ✅ |
| T-12 | Route quản trị projects (quyền field, slug khoá) + files + houses + versions + autosave + duplicate | be | API-20…23, 30…36 | 02a B5 (route) | T-5, T-11 | 1 | ✅ |
| T-13 | Library route | be | API-40, 41 | 02a B7 | T-12 | 0,5 | ✅ |
| T-14 | app.html: layout, đăng nhập (C1), guard, ui kit | fe | FR-01.05 | 02b F7 | T-11, T-4 | 1 | ✅ |
| T-15 | A1 khách hàng & tài khoản | fe | FR-01.01, 01.04 | 02b F8 | T-14 | 0,5 | ✅ |
| T-16 | A2 dự án (thông tin, tài liệu, mẫu nhà, sao chép, chia sẻ) | fe | FR-01.02, 02.*, 03.01, 03.09, 09.02–03 | 02b F9 (+ tab Chia sẻ F15) | T-14, T-12 | 1 | ✅ |
| T-17 | A4 thư viện đồ | fe | FR-05.01 | 02b F10 | T-14, T-13 | 0,5 | ✅ |
| T-18 | A3 trình dựng: store, autosave, canvas, tầng, công cụ khung, hiệu chỉnh, bắt điểm, undo | fe | FR-03.02–03.08 | 02b F11 | T-16, T-12 | 3 | ✅ |
| T-19 | **Spike GLB** + model upload + worker optimize + report | be | FR-04.01–04.03 | 02a B6 | T-12 | 1,5 | ✅ |
| T-20 | A3 tab Mô hình | fe | FR-04.01–04.03 | 02b F12 | T-18, T-19 (spike đạt) | 1 | ✅ |
| T-21 | A3 tab Đồ, Điểm nhìn & ảnh, thanh kiểm | fe | FR-04.05–04.07, 05.02–05.04 | 02b F13 | T-20, T-17 | 1,5 | ✅ |
| **Lát 3 — Duyệt & phát hành** |||||||
| T-22 | Workflow API + submissions + preview + E3/E4 | be | API-39, 50…55, FR-08.* | 02a B8 (route) | T-12, T-19 | 1 | ✅ |
| T-23 | A5 phiên bản & phát hành | fe | FR-08.01–08.08 | 02b F14 | T-22, T-18 | 1 | ⬜ |
| T-24 | C2 dự án của tôi + C3 xem trước & duyệt | fe | FR-08.03–05, 09.02–03 | 02b F15 | T-22, T-9, T-14 | 1 | ⬜ |
| **Lát 4 — Lead & thống kê** |||||||
| T-25 | Leads + chống bot + E5 + CSV | be | API-62, 70…72 | 02a B10 | T-6, T-11 | 1 | ⬜ |
| T-26 | Events + stats + CSV | be | API-63, 80, 81 | 02a B11 | T-6, T-11 | 0,5 | ⬜ |
| T-27 | V3 lead + chống bot + V5 chính sách | fe | FR-10.01–06, NFR-04 | 02b F6 | T-25, T-9 | 0,5 | ⬜ |
| T-28 | Tracker sự kiện | fe | FR-11.01 | 02b F5 | T-26, T-9 | 0,5 | ⬜ |
| T-29 | C4 lead + C5 thống kê + A6 | fe | FR-10.05, 11.02–03 | 02b F16 | T-25, T-26, T-14 | 1 | ⬜ |
| **Lát 5 — Hoàn thiện** |||||||
| T-30 | E2E Playwright (E2E-01, E2E-02 qua server thật + CSP) + cập nhật profile/system-map | fe+be | AC-* | 02b F17, 02a B13 | tất cả | 0,75 | ⬜ |

> Mỗi task Done khi: build + typecheck + test của component đều xanh; có test cho hành vi mới; chạy thử được (bằng chứng ghi ở CP8).

## 3. Thứ tự & song song
- **Đường găng:** T-1 → T-3 → T-5 → T-6 → T-8 → T-9 → T-12 → T-18 → T-20 → T-21 → T-22 → T-23 → T-25 → T-29 → T-30.
- **Song song được (khi có nhiều người):** T-2 ∥ T-3 ∥ T-4 · T-7 ∥ T-8 · T-11 ∥ T-10 · T-19 ∥ T-18 · T-25 ∥ T-26. Một người làm thì thứ tự là bảng §2.

## 4. Milestone

| Milestone | Gồm task | Demo được gì |
|---|---|---|
| M1 Xem nhà | T-1…T-10 | Mở link 4 mẫu nhà seed; xoay, chọn tầng, phòng, đứng trong phòng, xem đồ, mặt bằng có kích thước, tải PDF; mobile; thương hiệu khách |
| M2 Dựng nhà | T-11…T-21 | QTV đăng nhập, tạo khách hàng/dự án/mẫu nhà, can khung từ ảnh mặt bằng, tải GLB, gắn đồ, đặt điểm nhìn |
| M3 Duyệt | T-22…T-24 | Gửi duyệt → khách duyệt/yêu cầu sửa → phát hành → link công khai đổi phiên bản |
| M4 Bán hàng | T-25…T-29 | Người xem để lại SĐT → email → khách xem lead và thống kê |
| M5 Sẵn sàng kiểm thử | T-30 | E2E xanh; tài liệu hệ thống cập nhật |

## 5. Rủi ro tiến độ

| Rủi ro | Giảm thiểu |
|---|---|
| Trình dựng A3 (T-18, 20, 21) vượt ước lượng | Giới hạn công cụ ở mức AC-01; tự phát hiện phòng để P2 |
| Spike GLB (T-19) không đạt | T-20 chặn đến khi đạt; phương án lùi: không gộp mesh, chỉ cảnh báo draw call (ghi DEC) |
| Dependency native (sharp) lỗi cài | Bỏ nén texture (BE-R1) |
| Phạm vi lớn cho 1 người | Milestone M1 dùng được độc lập để đi demo bán hàng |

## 6. Bảng phủ FR → task

| FR | Task BE | Task FE |
|---|---|---|
| 01.01, 01.04, 01.05 | T-11 | T-14, T-15 |
| 01.02, 01.03 | T-5, T-12 | T-16 |
| 01.06 | T-6 (availability), T-11 | T-15, T-9 (V4) |
| 02.01–02.02 | T-12 | T-16 |
| 03.01, 03.09 | T-12 | T-16, T-18 |
| 03.02–03.08 | T-1, T-12 | T-18 |
| 04.01–04.03 | T-19 | T-20 |
| 04.04 | T-1 (wallSegments) | T-8 |
| 04.05–04.07 | — | T-21, T-8 |
| 05.01 | T-13 | T-17 |
| 05.02–05.04 | T-1 (assign) | T-21 |
| 05.05 | T-5 (snapshot) | T-9 |
| 06.01–06.15 | T-6 | T-8, T-9 |
| 07.01–07.05 | T-2 | T-10 |
| 08.01–08.09 | T-5, T-22 | T-23, T-24 |
| 09.01 | T-6 | T-9 |
| 09.02–09.04 | T-6, T-25, T-26 | T-16, T-24, T-28 |
| 10.01–10.06 | T-25 | T-27 |
| 11.01–11.03 | T-26 | T-28, T-29 |
