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
| G1 Yêu cầu | ⏳ chờ user | | khanhtt | SRS v0.1; chặn bởi Q-1 |
| G2 Thiết kế | ⬜ | | | |
| G3 Build | ⬜ | | | |
| G4 Kiểm thử | ⬜ | | | |
| G5 Release | ⬜ | | | |

## Solo pipeline
| # | Bước | Trạng thái | Ngày | Ghi chú |
|:-:|---|:---:|---|---|
| 1 | Mở item | ✅ | 2026-10-24 | yêu cầu user: "view nhà thật" giống video tham chiếu |
| 1a | Khảo sát tham chiếu | ✅ | 2026-10-24 | demo laquillaestate.lovable.app: 2 video AI (Higgsfield) tua theo cuộn + thẻ thông tin + thư viện 38 ảnh; không phải 3D |
| 2 | SRS item (`01-srs.md`) + CR-2 SRS hệ thống | ▶ chờ G1 | 2026-10-24 | |

## NOW
| Owner tiếp | Việc tiếp | Skill |
|---|---|---|
| khanhtt | Chốt Q-1 (công nghệ chuyển cảnh), duyệt G1 | ai-po-write-srs |

## Decisions
| ID | Chủ đề | Quyết định | Lý do | Ai | Ngày |
|---|---|---|---|---|---|
| DEC-T1 | Mở item mới thay vì CR trong item 01 | Tính năng mới ngoài phạm vi Phase 1 đã duyệt; dùng lại M08/M10/M11 | Tách phạm vi, không mở lại G3 item 01 | Agent | 2026-10-24 |
| DEC-T2 | Điều hướng | Nút Tiếp/Lùi (theo yêu cầu user), không làm "cuộn để tua video" như demo (Q-3) | User yêu cầu "ấn next" | Agent | 2026-10-24 |
| DEC-T3 | Một tuyến thẳng | P1 không làm nhánh rẽ (FR-12.15 = W) | Kịch bản chụp đơn giản cho người dùng | Agent | 2026-10-24 |
