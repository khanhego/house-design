# Project profile

> Adapter giữa bộ skill `ai-*` và dự án này. Skill đọc file này thay vì đoán.
> Last update: 2026-10-24 · T-30 (B13) — cập nhật theo kiến trúc Phase 1 (ADR-001, ADR-002)

## 1. Tổng quan
| Trường | Giá trị |
|---|---|
| Tên dự án | house-design (tên sản phẩm: chưa chốt) |
| Loại | web-app: monolith Node (API + phục vụ web build) + SQLite, npm workspaces (ADR-002) |
| Mô tả 1 câu | Nền tảng SaaS cho doanh nghiệp thiết kế nội thất trình bày nhà/thiết kế cho khách dưới dạng 3D và bản vẽ kỹ thuật |
| Có UI người dùng | yes |
| Quy mô | S (user chọn 2026-10-24) |
| Ngôn ngữ tài liệu | vi |
| `docs_root` | docs/ai |
| `business_docs_root` | docs/nghiep-vu |

## 2. Thành phần (component)
| Component | Loại `be`/`fe` | Path | Ngôn ngữ / framework | build | lint | test | run (local) |
|---|:---:|---|---|---|---|---|---|
| core | be+fe (thư viện chung) | `packages/core` | TypeScript 7 (Node type stripping), zod 4 — schema tài liệu nhà, hình học, quy tắc, vẽ mặt bằng | — | `npm run lint -w packages/core` | `npm test -w packages/core` | — |
| api | be | `apps/api` | Node 25, Fastify 5, node:sqlite, gltf-transform + meshoptimizer + sharp (worker thread), nodemailer | — (chạy TS trực tiếp) | `npm run lint -w apps/api` | `npm test -w apps/api` | `npm run dev` (gốc: API 8787 + Vite 5173) · `npm run seed` |
| web | fe | `apps/web` | React 19, Vite 8, react-router 8, TanStack Query, zustand, three + r3f + drei, jsPDF + svg2pdf | `npm run build` | `npm run lint -w apps/web` | `npm test -w apps/web` | `npm run dev` |
| e2e | fe+be | `e2e/`, `playwright.config.ts` | @playwright/test (Chrome hệ thống) — chạy trên server thật (build + API phục vụ dist, CSP thật), dữ liệu `data-e2e/` | — | — | `npm run e2e` | — |

## 3. Nguồn sự thật của hệ thống hiện tại
| Loại | Ở đâu (file / lệnh / URL) |
|---|---|
| Schema dữ liệu | `apps/api/src/db/migrations/*.sql` (SQLite) · tài liệu nhà: `packages/core/src/schema.ts` (ADR-001) |
| Interface / API | `apps/api/src/routes/*.ts` (contract: item 01 `02-tech-spec.md` §6) |
| Màn hình / route UI | `apps/web/src/viewer/main.tsx` (`/v/*`) · `apps/web/src/app/main.tsx` (`/studio/*`, `/portal/*`) |
| Cấu hình / env | `apps/api/src/config.ts` (PORT, DATA_DIR, WEB_DIST, PUBLIC_BASE_URL, SMTP_URL, FORM_TOKEN_SECRET, TURNSTILE_*), `apps/web/vite.config.ts` |
| Tài liệu sẵn có | `docs/ai/system/SRS.md`, ADR ở `docs/ai/system/decisions/`, nghiệp vụ ở `docs/nghiep-vu/` |

## 4. Quy trình mã nguồn
| Trường | Giá trị |
|---|---|
| VCS host | github — `https://github.com/khanhego/house-design.git` |
| Nhánh gốc | main |
| Mẫu nhánh | feat/<NN>-<slug> · fix/<NN>-<slug> · proto/<NN>-<slug> |
| Đích PR | main |
| Quy ước commit | conventional commits (đề xuất, chưa có lịch sử) |
| CI | — (chưa có) |
| Agent được commit? | chỉ khi user yêu cầu (user chọn 2026-10-24) |

## 5. Tracker
| Trường | Giá trị |
|---|---|
| Loại | none (chỉ 03-plan.md) — user chọn 2026-10-24 |
| Project / board | — |
| Cách tạo ticket | — |

## 6. Môi trường & release
| Môi trường | URL / đích | Cách deploy | Ai được deploy | Rollback |
|---|---|---|---|---|
| local | http://localhost:5173 (Vite, proxy `/api` `/files` → 8787) | `npm run seed` rồi `npm run dev` | dev | xoá `data/` rồi seed lại |
| staging | chưa rõ | chưa rõ | chưa rõ | chưa rõ |
| production | chưa rõ | chưa rõ | chưa rõ | chưa rõ |

## 7. Vai trò
| Vai | Người |
|---|---|
| PO · UX · Architect · Tech lead · PM · Dev BE · Dev FE · QA · Ops | khanhtt (solo, agent hỗ trợ) |

## 8. Definition of Done (bổ sung cho dự án)
- [ ] `npm run build` · `npm run lint` · `npm test` xanh; đổi luồng chính → `npm run e2e` xanh
- [ ] test mới cho hành vi mới
- [ ] `system-map.md` cập nhật nếu đổi data/API/màn

## 9. Ràng buộc & lưu ý riêng
- Prototype `src/` đã gỡ (DEC-17); code production nằm ở `apps/*`, `packages/core`.
- Import trong TS phải có đuôi `.ts`/`.tsx` (Node type stripping, `erasableSyntaxOnly`) — không dùng enum/namespace (DEC-36).
- Một tiến trình server (ADR-002): giới hạn tần suất và hàng đợi job nằm trong tiến trình/SQLite; nhiều server cần thiết kế lại.
- Baseline 2026-10-24 (sau T-30): build ✅ · lint (tsc) ✅ · test: core 25, api 67, web 4 ✅ · e2e 2 ✅.
