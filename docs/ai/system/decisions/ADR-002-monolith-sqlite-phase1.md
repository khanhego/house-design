# ADR-002 — Phase 1 chạy một server Node (API + web + job), SQLite và lưu file trên đĩa

| | |
|---|---|
| Trạng thái | Accepted |
| Tác giả | Architect (agent) |
| Reviewer | ai-lead-review (G2) |
| Người chốt | Agent theo ủy quyền DEC-16 |
| Ngày | 2026-10-24 |
| Work item / yêu cầu | item 01 · NFR-06, NFR-09 · CN-02, CN-03 |

> **TL;DR** — Một tiến trình Node chạy Fastify (API), phục vụ web tĩnh và file, đồng thời chạy job nền. Dữ liệu ở SQLite (`node:sqlite`, chế độ WAL), file ở thư mục trên đĩa. Truy cập dữ liệu và file nằm sau interface để chuyển sang Postgres/S3 khi cần. Đánh đổi: chưa mở rộng ngang được.

## Bối cảnh
- Quy mô S, một người vận hành (CN-02).
- Giá bán thấp nên chi phí hạ tầng mỗi mẫu nhà phải thấp (CN-03).
- Tải Phase 1 dự kiến: ≤ 20 dự án, ≤ 50.000 lượt xem/tháng, ghi chủ yếu là sự kiện xem.
- Máy dev đã có `node:sqlite` (SQLite 3.53), không có Postgres.

## Tiêu chí quyết định
| Tiêu chí | Ngưỡng |
|---|---|
| Chi phí hạ tầng | Một VPS ≤ 1 triệu ₫/tháng |
| Vận hành | Một lệnh khởi động, một thư mục sao lưu |
| Sẵn sàng | Trang xem ≥ 99,5% (NFR-06) |

## Các phương án
| Phương án | Ưu | Nhược | Chi phí / rủi ro |
|---|---|---|---|
| A. Monolith + SQLite + đĩa | Rẻ, đơn giản, sao lưu dễ | Một máy; ghi tuần tự | Thấp |
| B. API + Postgres + S3 + hàng đợi | Mở rộng tốt | Nhiều dịch vụ phải vận hành | TB–cao |
| C. Serverless | Không quản server | Xử lý GLB nặng không hợp; cold start | TB |

## Quyết định
Chọn A. Module `db` (repository) và `storage` (put/get/url) là ranh giới để đổi sang B.

## Hệ quả
| Loại | Nội dung |
|---|---|
| Tốt | Chạy local và staging giống nhau; sao lưu = `VACUUM INTO` + copy thư mục |
| Xấu / đánh đổi | Job tối ưu GLB dùng CPU chung với API → giới hạn 1 job/lúc |
| Phải làm thêm | Migration SQL đánh số; interface storage |

## Câu hỏi mở & điều kiện xem lại
Xem lại khi: > 50 dự án đang hoạt động, > 500.000 sự kiện/ngày, hoặc cần chạy 2 server trở lên.
