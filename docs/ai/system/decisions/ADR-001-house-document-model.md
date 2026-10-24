# ADR-001 — Mẫu nhà lưu dạng tài liệu JSON theo phiên bản, khoá bằng snapshot khi gửi duyệt

| | |
|---|---|
| Trạng thái | Accepted |
| Tác giả | Architect (agent) |
| Reviewer | ai-lead-review (G2) |
| Người chốt | Agent theo ủy quyền DEC-16 |
| Ngày | 2026-10-24 |
| Work item / yêu cầu | item 01 · FR-03.*, FR-08.01–08.06 · BR-01, BR-02, BR-03, BR-12 |

> **TL;DR** — Mỗi phiên bản mẫu nhà là một tài liệu `HouseDocument` (JSON, schema zod trong `packages/core`). **Mỗi lần gửi duyệt** tạo một bản ghi `submission` bất biến chứa `snapshot` (đã giải sẵn đồ, mô hình, file; bỏ ảnh nền bí mật) và `snapshotHash`. Review gắn với submission. Phát hành dùng snapshot của submission đã duyệt. Đánh đổi: không truy vấn SQL sâu vào phòng/đồ.
>
> *Sửa 2026-10-24 sau review G2 (R-12): snapshot chuyển từ cột trên `version` sang bảng `submission` để nội dung bị từ chối không bị ghi đè.*

## Bối cảnh
- Trình dựng sửa rất nhiều đối tượng nhỏ (tường, cửa, phòng, đồ) và cần autosave.
- Nội dung được duyệt phải đúng bằng nội dung công khai (P6, BR-01) và không đổi khi thư viện đồ thay đổi sau đó.
- Mặt bằng, diện tích và 3D phải tính bằng cùng một logic ở FE và BE (BR-12).

## Tiêu chí quyết định
| Tiêu chí | Ngưỡng |
|---|---|
| Nội dung công khai = nội dung đã duyệt | Bắt buộc |
| Autosave đơn giản, chống ghi đè | Một request/lần lưu; khoá lạc quan |
| Logic hình học dùng chung FE/BE | Một nguồn |
| Công sức Phase 1 | Thấp |

## Các phương án
| Phương án | Ưu | Nhược | Chi phí / rủi ro |
|---|---|---|---|
| A. Tài liệu JSON + snapshot | Khoá/sao chép/so sánh dễ; schema dùng chung | Không truy vấn sâu bằng SQL; tài liệu lớn (ước tính ≤ 1 MB/mẫu) | Thấp |
| B. Bảng chuẩn hoá (floor, wall, room, item) | Truy vấn linh hoạt | Snapshot phải sao chép nhiều bảng; autosave nhiều câu lệnh; nhiều migration | Cao |
| C. Event sourcing các thao tác dựng | Có lịch sử chi tiết | Quá phức tạp cho Phase 1 | Rất cao |

## Quyết định
Chọn A. Thống kê và lead (cần truy vấn) nằm ở bảng riêng, không phụ thuộc truy vấn sâu vào tài liệu.

## Hệ quả
| Loại | Nội dung |
|---|---|
| Tốt | Duyệt = phát hành chính xác; sao chép mẫu nhà = sao chép JSON + đổi id |
| Xấu / đánh đổi | Báo cáo "top đồ" lấy tên từ snapshot thay vì join SQL |
| Phải làm thêm | `schemaVersion` + hàm nâng cấp tài liệu khi schema đổi |

## Câu hỏi mở & điều kiện xem lại
Xem lại khi cần tìm kiếm đồ xuyên mẫu nhà (Phase 3: báo giá theo đồ) hoặc khi tài liệu vượt 5 MB.
