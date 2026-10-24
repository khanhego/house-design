# 01-interior-showcase-platform — Status

| Trường | Giá trị |
|---|---|
| Tên | Giải pháp chuyển đổi quảng cáo nhà sang 3D tương tác + bản vẽ kỹ thuật (dịch vụ + nền tảng) — MVP |
| Loại | feature (sản phẩm mới) |
| Lane | feature — thêm 2 bước trước SRS theo yêu cầu user: phân tích yêu cầu (`00a`) → market research (`00b`) (DEC-2) |
| Quy mô | S |
| Component bị chạm | web (fe: trang xem, cổng khách hàng, công cụ nội bộ) · BE: cần (tài khoản, dữ liệu, xử lý GLB, lead, thống kê) — architect quyết ở `02` |
| Last update | 2026-10-24 · ai-flow-route |

## Tiến độ
| Gate | Trạng thái | Ngày | Người duyệt | Ghi chú |
|:---:|:---:|---|---|---|
| G1 Yêu cầu | ✅ | 2026-10-24 | khanhtt | SRS v0.2 Approved |
| Spec 02 / 02a / 02b | ✅ ✅ ✅ Approved | 2026-10-24 | agent | |
| G2 Thiết kế | ✅ | 2026-10-24 | agent (DEC-16) | Review subagent 2 vòng; điều kiện: spike GLB trước F12/F13 (DEC-34) |
| Plan | ✅ | 2026-10-24 | agent (DEC-35) | 30 task, 5 lát |
| G3 Build | ⬜ | | | |
| G4 Kiểm thử | ⬜ | | | |
| G5 Release | ⬜ | | | |

## Solo pipeline
| # | Bước | Trạng thái | Ngày | Ghi chú |
|:-:|---|:---:|---|---|
| 0 | Init (profile, system-map, baseline) | ✅ | 2026-10-24 | quy mô S, tracker none, commit khi user yêu cầu |
| 1 | Mở item | ✅ | 2026-10-24 | |
| 1a | Phân tích yêu cầu (`00a`) | ✅ v0.2 | 2026-10-24 | viết lại theo DEC-3 |
| 1b | Market research (`00b` đầy đủ + `00c` tóm gọn + HTML) | ✅ | 2026-10-24 | v0.2 chấp nhận (DEC-7); HTML: https://claude.ai/artifact/Lx8xgea9AgefHqhQtnD5N2 |
| 2 | SRS (`01` + `system/SRS.md`) | ✅ | 2026-10-24 | SRS theo phase; item 01 = Phase 1 |
| 2b | Màn hình (`system/SRS.md` §10) | ✅ | 2026-10-24 | 16 màn + 5 email; mọi FR P1 có màn; DEC-12…15 |

| 3 | Tech spec `02` + ADR-001, ADR-002 | ✅ CP3 (DEC-20, agent) | 2026-10-24 | |
| 4a | BE spec `02a` | ✅ CP4a (agent) | 2026-10-24 | |
| 4b | FE spec `02b-fe-spec-web` | ✅ CP4b (agent) | 2026-10-24 | |
| 5 | Review bộ spec (subagent) | ✅ G2 | 2026-10-24 | V1 Fail (4 blocker/15 major) → v0.2 → V2 Pass có ĐK → sửa N-01…08 |
| 6 | Plan `03` | ✅ Plan | 2026-10-24 | DEC-35 |
| 7 | Test cases `04` | ✅ CP7 | 2026-10-24 | 82 TC, 48 P1 |
| 8 | Implement (theo `03`) | ▶ đang làm | 2026-10-24 | nhánh `feat/01-interior-showcase-platform` |

## NOW
| Owner tiếp | Việc tiếp | Skill |
|---|---|---|
| Dev | T-1 → T-30 theo `03` | ai-be-implement / ai-fe-implement |

## Phản hồi giữa các vai
| Từ | Tới | Nội dung | Trạng thái |
|---|---|---|---|

## Decisions
| DEC | Bối cảnh | Lựa chọn | Lý do | Người chốt | Ngày |
|---|---|---|---|---|---|
| DEC-1 | Đã có code demo 3D trong `src/` | Giữ làm prototype tham khảo, không mặc định là nền production | User chọn | khanhtt | 2026-10-24 |
| DEC-3 | User làm rõ mô hình kinh doanh | Dịch vụ + nền tảng của user; khách: CĐT/sàn BĐS, xây nhà trọn gói, thiết kế–thi công nội thất | User chọn | khanhtt | 2026-10-24 |
| DEC-4 | Q1 cách đưa thiết kế vào | Lai: khung ngữ nghĩa trên web + upload GLB; đội user thao tác | User chọn | khanhtt | 2026-10-24 |
| DEC-5 | Q2 bản vẽ | Tự sinh mặt bằng kích thước/bố trí/trần-điện theo TCVN, PDF/DXF; đính kèm mặt cắt/chi tiết | User chọn | khanhtt | 2026-10-24 |
| DEC-6 | Phạm vi MVP | Bản vẽ là xương sống công nghệ; báo giá theo đồ làm sau MVP | User chốt | khanhtt | 2026-10-24 |
| DEC-7 | Market research v0.2 | Chấp nhận để viết SRS | User yêu cầu viết SRS sau khi xem bản tóm gọn | khanhtt | 2026-10-24 |
| DEC-8 | Loại nhà P1 | Căn hộ · nhà phố/nhiều tầng · biệt thự · nhà cấp 4/nhà vườn | User chọn | khanhtt | 2026-10-24 |
| DEC-9 | Nhập nội dung P1 | Công cụ quản trị nội bộ tối thiểu | User chọn | khanhtt | 2026-10-24 |
| DEC-10 | Bản vẽ theo phase | P1 mặt bằng cơ bản + PDF; P2 đủ bộ | User chọn | khanhtt | 2026-10-24 |
| DEC-11 | Bổ sung P1 | Thương hiệu/nhúng/QR · lead · thống kê · CĐT duyệt | User chọn | khanhtt | 2026-10-24 |
| DEC-16 | User: "Chạy build solo tự quyết định đi" | Agent tự duyệt CP/gate, ghi DEC; review bằng subagent; không push/deploy production | Lời user | khanhtt | 2026-10-24 |
| DEC-20 | CP3/CP4a/CP4b | Agent tự duyệt spec để sang review | DEC-16 | Agent | 2026-10-24 |
| DEC-34 | G2 | Agent duyệt sau 2 vòng review; ĐK spike GLB trước F12/F13 | DEC-16 | Agent | 2026-10-24 |
| CR-1 | SRS v0.3 | Thêm màn V5 chính sách dữ liệu | R-25 | Agent | 2026-10-24 |
| DEC-35 | Plan | Agent duyệt Plan (5 lát, đường găng §3) | DEC-16 | Agent | 2026-10-24 |
| DEC-2 | Quy trình chuẩn không có bước market research | Thêm `00a-requirement-analysis.md`, `00b-market-research.md` trong thư mục item, làm input cho SRS | User yêu cầu thứ tự: phân tích → research → SRS | khanhtt | 2026-10-24 |

## Lịch sử
| Ngày | Role | Việc |
|---|---|---|
| 2026-10-24 | ai-flow-init | Tạo `.ai/profile.md`, `system/system-map.md`; baseline build ✅, lint/test không có |
| 2026-10-24 | ai-flow-route | Mở item 01, lane feature |
| 2026-10-24 | PO | Viết `00a-requirement-analysis.md`, `00b-market-research.md` |
| 2026-10-24 | PO | User làm rõ mô hình (DEC-3); viết lại `00a` v0.2; research thị trường làm lại |
| 2026-10-24 | PO | Market research v0.2: `00b` đầy đủ, `00c` tóm gọn + HTML; dừng chờ user chốt |
| 2026-10-24 | PO | Viết `system/SRS.md` v0.1 (theo phase) + `01-srs.md` (Phase 1); chờ G1 |
| 2026-10-24 | UX | Viết SRS §10 (journey, đặc tả màn, trạng thái, phác thảo ASCII, kiểm phủ); SRS v0.2 |
| 2026-10-24 | PO | G1 ✅ — SRS v0.2 Approved |
| 2026-10-24 | Architect/BE/FE | Viết `02`, `02a`, `02b-fe-spec-web`, ADR-001, ADR-002 |
| 2026-10-24 | Tech lead (subagent) | Review spec vòng 1 Fail, vòng 2 Pass có điều kiện |
| 2026-10-24 | Architect/BE/FE | Spec v0.2 + sửa N-01…N-08; G2 ✅ |
| 2026-10-24 | PM/QA | `03-plan.md` (Plan ✅), `04-test-cases.md` (CP7) |
