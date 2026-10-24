# 02-real-photo-tour — Status

| Trường | Giá trị |
|---|---|
| Tên | Tham quan ảnh thật (Photo Tour) — chế độ xem thứ hai cho mẫu nhà |
| Loại | feature |
| Lane | feature (solo pipeline) |
| Quy mô | S |
| Component bị chạm | core (schema tour, kiểm gửi duyệt) · api (tệp ảnh/clip tour, tối ưu ảnh, xoá EXIF, sự kiện) · web (V6, A7) |
| Phụ thuộc | Item 01 (M03, M08, M10, M11) |
| Last update | 2026-10-24 · PO |

## Tiến độ
| Gate | Trạng thái | Ngày | Người duyệt | Ghi chú |
|:---:|:---:|---|---|---|
| G1 Yêu cầu | ✅ | 2026-10-24 | khanhtt | SRS v1.0; Q-1 = A + C |
| G2 Thiết kế | ✅ | 2026-10-24 | agent | `02-tech-spec.md` (gộp, quy mô S) |
| G3 Build | ⬜ | | | |
| G4 Kiểm thử | ⬜ | | | |
| G5 Release | ⬜ | | | |

## Solo pipeline
| # | Bước | Trạng thái | Ngày | Ghi chú |
|:-:|---|:---:|---|---|
| 1 | Mở item | ✅ | 2026-10-24 | yêu cầu user: "view nhà thật" giống video tham chiếu |
| 1a | Khảo sát tham chiếu | ✅ | 2026-10-24 | demo laquillaestate.lovable.app: 2 video AI (Higgsfield) tua theo cuộn + thẻ thông tin + thư viện 38 ảnh; không phải 3D |
| 2 | SRS item (`01-srs.md`) + CR-2 SRS hệ thống | ✅ G1 | 2026-10-24 | user duyệt |
| 3 | Tech spec (`02-tech-spec.md`, gộp BE+FE — quy mô S) | ✅ | 2026-10-24 | kèm plan T2-1…T2-6 (§6) |
| 8 | Implement T2-1…T2-6 | ✅ | 2026-10-24 | core 29 · api 84 · web 13 · e2e 3 (thêm E2E-03); migration 002 (sao lưu `data/app.db.bak-truoc-migration-002`) |
| 9 | Commit cục bộ | ✅ | 2026-10-24 | chưa push |
| 10 | Review code (subagent) | ✅ G3 (agent, DEC-T7) | 2026-10-25 | Đạt có ĐK: 0 blocker, 2 major (R-T-01 clip làm kẹt trình xem, R-T-02 GPS trong MP4), 9 minor, 5 nit → đã sửa hết; core 29 · api 85 · web 16 |
| 12 | CR-3 implement (Phim, chương, màn lộ, điện ảnh, giá) | ✅ | 2026-10-25 | migration 003; core 31 · api 85 · web 17 · e2e 3; demo ảnh thật |
| 11 | Chạy test `04a` | ⬜ | | |

## NOW
| Owner tiếp | Việc tiếp | Skill |
|---|---|---|
| QA | Chạy AC-T1…T11 → G4 | ai-qa-run-tests |

## Decisions
| ID | Chủ đề | Quyết định | Lý do | Ai | Ngày |
|---|---|---|---|---|---|
| DEC-T1 | Mở item mới thay vì CR trong item 01 | Tính năng mới ngoài phạm vi Phase 1 đã duyệt; dùng lại M08/M10/M11 | Tách phạm vi, không mở lại G3 item 01 | Agent | 2026-10-24 |
| DEC-T2 | Điều hướng | Nút Tiếp/Lùi (theo yêu cầu user), không làm "cuộn để tua video" như demo (Q-3) | User yêu cầu "ấn next" | Agent | 2026-10-24 |
| DEC-T4 | Q-1 | Chuyển cảnh mô phỏng + clip tải lên ở Phase 1; API AI ở Phase 2 | User chốt | khanhtt | 2026-10-24 |
| DEC-T5 | HEIC | Không giải mã HEIC ở server (sharp không có HEVC); ô chọn tệp chỉ nhận JPG/PNG/WebP để iPhone tự chuyển; HEIC gửi thẳng → 415 hướng dẫn xuất JPG; kịch bản chụp hướng dẫn chọn "Tương thích nhất" | Q-4 | Agent | 2026-10-24 |
| DEC-T6 | Mẫu nhà chỉ có tour | Tầng rỗng không tính 3D và bị bỏ qua khi kiểm; không cảnh báo điểm nhìn mặc định; ảnh đại diện có thể là ảnh cảnh tour | FR-12.10 | Agent | 2026-10-24 |
| DEC-T7 | G3 | Sửa toàn bộ 16 phát hiện; clip MP4 làm sạch bằng JS thuần (không phụ thuộc ffmpeg trên server) — đã kiểm với MP4 có GPS do ffmpeg tạo: hết toạ độ, vẫn giải mã đủ khung | Server production có thể không có ffmpeg | Agent | 2026-10-25 |
| DEC-T8 | CR-3 | User chọn làm cả 4 ý (Phim cuộn, chương + màn lộ, chất điện ảnh, thông số + giá); giá đi theo bản duyệt | Câu lệnh mẫu user gửi | khanhtt | 2026-10-25 |
| DEC-T9 | Ảnh demo thật | Bộ ảnh Stahl House (Los Angeles) của Amelia Pergl, Wikimedia Commons, giấy phép CC BY 2.0 — chỉ dùng làm dữ liệu thử local, ghi công tác giả trong mô tả tour và tệp `CREDITS.txt`; không phải dữ liệu khách hàng | User yêu cầu ảnh thật; không dùng ảnh tin đăng có bản quyền | Agent | 2026-10-25 |
| DEC-T3 | Một tuyến thẳng | P1 không làm nhánh rẽ (FR-12.15 = W) | Kịch bản chụp đơn giản cho người dùng | Agent | 2026-10-24 |
