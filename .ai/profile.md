# Project profile

> Adapter giữa bộ skill `ai-*` và dự án này. Skill đọc file này thay vì đoán.
> Last update: 2026-10-24 · ai-flow-init

## 1. Tổng quan
| Trường | Giá trị |
|---|---|
| Tên dự án | house-design (tên sản phẩm: chưa chốt) |
| Loại | web-app (hiện có 1 client web; BE chưa có — architect quyết ở `02`) |
| Mô tả 1 câu | Nền tảng SaaS cho doanh nghiệp thiết kế nội thất trình bày nhà/thiết kế cho khách dưới dạng 3D và bản vẽ kỹ thuật |
| Có UI người dùng | yes |
| Quy mô | S (user chọn 2026-10-24) |
| Ngôn ngữ tài liệu | vi |
| `docs_root` | docs/ai |
| `business_docs_root` | docs/nghiep-vu |

## 2. Thành phần (component)
| Component | Loại `be`/`fe` | Path | Ngôn ngữ / framework | build | lint | test | run (local) |
|---|:---:|---|---|---|---|---|---|
| web (prototype) | fe | `src/`, `index.html` | TypeScript 7, React 19, Vite 8, three 0.186, @react-three/fiber 9, @react-three/drei 10 (nguồn: `package.json`) | `npm run build` | — | — | `npm run dev` |

> Chưa có component `be`. Thêm khi `ai-architect-write-spec` chốt kiến trúc.

## 3. Nguồn sự thật của hệ thống hiện tại
| Loại | Ở đâu (file / lệnh / URL) |
|---|---|
| Schema dữ liệu | `src/data/types.ts` (kiểu TS, dữ liệu tĩnh — chưa có DB) |
| Interface / API | — (chưa có) |
| Màn hình / route UI | `src/App.tsx` (hash route `#/` và `#/house/:id`) |
| Cấu hình / env | `vite.config.ts`, `tsconfig.json` |
| Tài liệu sẵn có | — |

## 4. Quy trình mã nguồn
| Trường | Giá trị |
|---|---|
| VCS host | github — `https://github.com/khanhego/house-design.git` |
| Nhánh gốc | main (chưa có commit nào) |
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
| local | http://localhost:5173 | `npm run dev` | dev | — |
| staging | chưa rõ | chưa rõ | chưa rõ | chưa rõ |
| production | chưa rõ | chưa rõ | chưa rõ | chưa rõ |

## 7. Vai trò
| Vai | Người |
|---|---|
| PO · UX · Architect · Tech lead · PM · Dev BE · Dev FE · QA · Ops | khanhtt (solo, agent hỗ trợ) |

## 8. Definition of Done (bổ sung cho dự án)
- [ ] build pass (`npm run build`); lint/test: chưa có — thêm khi có spec
- [ ] test mới cho hành vi mới
- [ ] `system-map.md` cập nhật nếu đổi data/API/màn

## 9. Ràng buộc & lưu ý riêng
- Code trong `src/` hiện là **prototype** (demo xem nhà 3D, dữ liệu giả) — tham khảo, không mặc định là nền production (DEC-1 trong item 01).
- Baseline 2026-10-24: build ✅ pass · lint — không có · test — không có.
