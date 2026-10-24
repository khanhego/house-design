# System map

> Bản đồ hệ thống đang chạy — nền cho reuse-first. Mỗi dòng có nguồn (file/lệnh).
> Ai làm thay đổi hệ thống thì cập nhật file này. Last update: 2026-10-24 · item 01 T-30

## Module / component
| Module | Trách nhiệm | Path | Chủ |
|---|---|---|---|
| core · schema | Tài liệu nhà (tầng, tường, cửa, phòng, cầu thang, sân, đồ, mô hình, điểm nhìn), đơn vị mm | `packages/core/src/schema.ts` | khanhtt |
| core · hình học & quy tắc | Đoạn tường, diện tích (BR-04), kiểm trước khi gửi, ngân sách hiển thị (BR-07), chuẩn hoá SĐT | `packages/core/src/{geometry,rules}.ts` | khanhtt |
| core · mặt bằng | SVG mặt bằng có chuỗi kích thước (BR-12) | `packages/core/src/plan/planSvg.ts` | khanhtt |
| api · auth & quyền | Phiên cookie, khoá đăng nhập, mời/đặt mật khẩu, quyền theo vai trò & khách hàng | `apps/api/src/lib/auth.ts`, `services/access.ts` | khanhtt |
| api · workflow | Gửi duyệt, snapshot, duyệt/duyệt thay, phát hành, gỡ, nhắc E4 | `apps/api/src/services/{workflow,snapshot}.ts` | khanhtt |
| api · công khai | Trang dự án/mẫu nhà, khả dụng theo hợp đồng (BR-08), OG | `apps/api/src/services/public.ts` | khanhtt |
| api · lead & thống kê | Lead (chống bot, gộp 24 giờ, E5, CSV, xoá cứng), sự kiện xem, thống kê | `apps/api/src/services/{leads,stats}.ts` | khanhtt |
| api · mô hình 3D | Tối ưu GLB trong worker thread, báo cáo ngân sách, giữ node `item_`/`wall_` | `apps/api/src/jobs/{modelOptimize,modelWorker,modelJob}.ts` | khanhtt |
| api · job & email | Hàng đợi 3 làn (mail/model/cron), outbox E1–E5 | `apps/api/src/jobs/runner.ts`, `services/mail.ts`, `email/templates.ts` | khanhtt |
| web · cảnh 3D | Tầng, tường cắt tự động, đồ, mô hình GLB, camera | `apps/web/src/scene/*` | khanhtt |
| web · trình dựng | Store undo/redo, autosave If-Match, canvas mặt bằng, tab Mô hình/Đồ/Điểm nhìn | `apps/web/src/app/studio/editor/*` | khanhtt |
| web · tracker | Phiên 30 phút, gửi lô sự kiện | `apps/web/src/lib/tracker.ts` | khanhtt |

## Data
| Thực thể | Nơi lưu | Field chính | Nguồn định nghĩa |
|---|---|---|---|
| clients, users, sessions | SQLite | trạng thái, hạn hosting, gói; vai trò admin/producer/approver | `apps/api/src/db/migrations/001_init.sql` |
| projects, houses | SQLite | slug (khoá sau phát hành), liên hệ, email nhận lead | như trên |
| versions | SQLite | `document` JSON (ADR-001), revision, state; mỗi nhà ≤ 1 bản mở, ≤ 1 bản phát hành | như trên |
| submissions, reviews | SQLite (bất biến, trigger) | snapshot + sha256, quyết định, bằng chứng | như trên |
| files, model_assets | SQLite + `DATA_DIR/files` | kind, storage key; báo cáo tối ưu GLB | như trên |
| leads, view_events | SQLite | SĐT chuẩn hoá, ngữ cảnh tầng/phòng, nguồn; sự kiện theo phiên | như trên |
| jobs, outbox_emails | SQLite | làn, số lần thử; email có `lead_id` để che khi xoá | như trên |

## Interface / API
| Endpoint / event / command | Mục đích | Quyền | Nguồn |
|---|---|---|---|
| `/api/v1/auth/*`, `/clients`, `/users` | Đăng nhập, tài khoản, khách hàng (API-01…13) | admin; tự phục vụ | `routes/auth.ts`, `routes/admin.ts` |
| `/projects`, `/houses`, `/versions/:id(/document)`, `/files` | Dự án, mẫu nhà, autosave, tệp (API-20…36) | admin, producer; approver đọc | `routes/projects.ts`, `routes/files.ts` |
| `/projects/:id/models`, `/models/:id`, `/library/*` | GLB, thư viện đồ (API-37…41) | admin, producer | `routes/models.ts`, `routes/library.ts` |
| `/versions/:id/{preview,submit,withdraw,review,review-on-behalf,publish}`, `/houses/:id/unpublish` | Workflow (API-39, 50…55) | xem §6 02-tech-spec | `routes/workflow.ts` |
| `/public/projects/:slug(/houses/:house)`, `/public/leads`, `/public/events` | Trang xem, lead, sự kiện (API-60…63) | công khai | `routes/public.ts`, `routes/leads.ts` |
| `/leads(.csv)`, `/stats(.csv)` | Lead, thống kê (API-70…72, 80, 81) | admin; approver theo khách hàng | `routes/leads.ts` |
| `/files/:key` | Tải tệp theo quyền (02 §6.2) | theo kind | `routes/files.ts` |
| job `model.optimize`, `review.remind`, `email.send` | Tối ưu GLB, nhắc duyệt E4, gửi email | — | `jobs/*` |

## Màn hình / bề mặt UI
| Route / màn | Mục đích | Component chính | Nguồn |
|---|---|---|---|
| `/v/:project` (V1) | Danh sách mẫu nhà, lọc loại | `ProjectPage` | `apps/web/src/viewer/ProjectPage.tsx` |
| `/v/:project/:house` (V2, V4) | Xem 3D, tầng/phòng/đồ, mặt bằng, PDF, dự phòng | `HousePage`, `No3D` | `viewer/HousePage.tsx`, `viewer/Fallback.tsx` |
| V3 | Form lead | `LeadDrawer` | `viewer/LeadDrawer.tsx` |
| `/v/:project/chinh-sach-du-lieu` (V5) | Chính sách dữ liệu | `PrivacyRoute` | `viewer/main.tsx` |
| `/studio/clients`, `/users` (A1) | Khách hàng, tài khoản | | `app/studio/Clients.tsx` |
| `/studio/projects(/:id)` (A2) | Dự án, tài liệu, mẫu nhà, chia sẻ | | `app/studio/Projects.tsx` |
| `/studio/houses/:id/edit` (A3) | Trình dựng | `EditorPage` | `app/studio/editor/EditorPage.tsx` |
| `/studio/library` (A4) | Thư viện đồ | | `app/studio/Library.tsx` |
| `/studio/houses/:id/versions` (A5) | Phiên bản & phát hành | `VersionsPage` | `app/studio/Versions.tsx` |
| `/portal` (C2), `/portal/review/:id` (C3) | Dự án của tôi, xem trước & duyệt | `PortalHome`, `ReviewPage` | `app/portal/*` |
| `/portal/leads`, `/portal/stats` (C4, C5) · `/studio/leads`, `/studio/stats` (A6) | Lead, thống kê | `LeadsPage`, `StatsPage` | `app/portal/{Leads,Stats}.tsx` |

## Tích hợp ngoài
| Hệ thống | Mục đích | Cách gọi | Config |
|---|---|---|---|
| SMTP | Email E1–E5 | nodemailer; không cấu hình → ghi `DATA_DIR/mail/outbox.log` | `SMTP_URL`, `MAIL_FROM` |
| Cloudflare Turnstile | Xác minh khi lead vượt giới hạn | script phía viewer + `siteverify` | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` |
| Google Fonts | Be Vietnam Pro (web); PDF nhúng TTF cục bộ | `<link>`; `public/fonts` | `apps/web/*.html` |

## Thành phần dùng chung (reuse trước khi viết mới)
| Tên | Dùng cho | Path |
|---|---|---|
| `HousePage` | Trang xem công khai và xem trước C3 | `apps/web/src/viewer/HousePage.tsx` |
| `EditorScene`, `useResolved` | Cảnh 3D trong các tab trình dựng | `apps/web/src/app/studio/editor/EditorScene.tsx` |
| `planSvg` | Mặt bằng cho V2, PDF, trình dựng | `packages/core/src/plan/planSvg.ts` |
| `ShareBox` | Link, mã nhúng, QR | `apps/web/src/app/share.tsx` |
| `ScopeFilters` | Lọc khách hàng/dự án/mẫu nhà | `apps/web/src/app/portal/filters.tsx` |
| `toCsv`, `slidingWindow`, `formTokens` | CSV an toàn, giới hạn tần suất, token form | `apps/api/src/lib/*` |
| UI kit (`Button`, `Modal`, `Confirm`, `StateBadge`, …) | Studio & portal | `apps/web/src/app/ui.tsx` |
