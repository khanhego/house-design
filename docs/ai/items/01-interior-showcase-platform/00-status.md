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
| 8 | Implement (theo `03`) | ✅ CP8 (agent) | 2026-10-24 | nhánh `feat/01-interior-showcase-platform`; T-1…T-30 ✅; test: core 25 · api 67 · web 4 · e2e 2 |
| 8c | Tài liệu nghiệp vụ lát 1–4 | ✅ CP8c | 2026-10-24 | `docs/nghiep-vu/01-interior-showcase-platform/lat-0{1..4}-*.md`; lát 5 (E2E, profile) không có nghiệp vụ mới — DEC-41 |
| 9 | Commit | ✅ CP9 | 2026-10-24 | chỉ commit cục bộ trên nhánh, **chưa push / chưa PR** (cần user) |
| 10 | Review code (subagent) | ✅ G3 (agent, DEC-45) | 2026-10-24 | Đạt có ĐK: 0 blocker, 5 major, 4 minor, 3 nit → đã sửa R-G3-01…12 + 8 test hồi quy; api 75 test, e2e 2 ✅ |
| 11 | Chạy test `04a` | ⬜ | | |

## NOW
| Owner tiếp | Việc tiếp | Skill |
|---|---|---|
| QA | Chạy bộ `04` → `04a`, chốt G4 | ai-qa-run-tests |

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
| DEC-36 | Chạy TS | Node 25 type stripping, import `.ts`, không build API | Ít công cụ; TS7 hỗ trợ | Agent | 2026-10-24 |
| DEC-38 | Biểu đồ C5 | Chỉ vẽ lượt xem theo ngày (một trục); lead theo ngày ở chú thích khi rê chuột và CSV | Lead nhỏ hơn lượt xem hàng chục lần; tránh hai trục | Agent | 2026-10-24 |
| DEC-39 | C3 khi bản về Đang dựng | Người duyệt thấy thông báo theo metadata, không gọi API-39 (tránh 403 giả) | R-11 | Agent | 2026-10-24 |
| DEC-40 | Gộp lead | Lần gửi sau không có tầng/phòng thì giữ ngữ cảnh cũ; trường trống giữ giá trị cũ; trạng thái về "Mới" | Không mất thông tin, sales biết khách quay lại | Agent | 2026-10-24 |
| DEC-41 | Lát 5 | Không viết tài liệu nghiệp vụ riêng (chỉ E2E + profile/system-map) | Không có quy tắc nghiệp vụ mới | Agent | 2026-10-24 |
| DEC-42 | Quyền xem khách hàng | Người dựng chỉ nhận `{id, name}` ở GET /clients (lọc dự án); chi tiết khách hàng chỉ QTV (R-G3-08) | Ma trận API-10/11 | Agent | 2026-10-24 |
| DEC-43 | IP sau proxy | `TRUST_PROXY_HOPS` (mặc định 0 = không tin X-Forwarded-For); production đặt đúng số proxy (R-G3-01) | Chặn giả IP vượt giới hạn tần suất | Agent | 2026-10-24 |
| DEC-44 | Change request API-52/53 | Thêm `submissionId` bắt buộc; API-39 trả `preview.submissionId`. Quyết định chỉ ghi khi trùng lần gửi hiện tại (R-G3-03) | Đúng ý DEC-30: duyệt gắn với nội dung đã xem | Agent | 2026-10-24 |
| DEC-45 | G3 | Duyệt sau khi sửa toàn bộ 12 phát hiện | Lint, 104 test đơn vị/tích hợp và 2 E2E xanh | Agent | 2026-10-24 |
| DEC-46 | Change request (user, 2026-10-24) FR-06 điều hướng 3D | Toàn cảnh: cuộn zoom tại con trỏ, nút ＋/−/⌂, nhấp đúp sàn để lại gần, giới hạn lùi xa theo kích thước nhà, chuyển cảnh mượt hơn. Đứng trong phòng: người mẫu 1,70 m góc nhìn thứ ba, FOV 62°, đi bằng bấm sàn hoặc W/S (A/D xoay), va chạm tường (qua được cửa đi, không qua cửa sổ), camera không lọt sau tường, zoom sát thành góc nhìn người thứ nhất ở tầm mắt 1,6 m | Phản hồi user khi test: khó thao tác chuột, cần cảm giác tỷ lệ phòng. Chưa có va chạm với đồ nội thất | Agent | 2026-10-24 |
| DEC-47 | Tỷ lệ người mẫu (phản hồi user 2026-10-24) | Dựng lại theo số đo người 1,70 m (đầu 0,23 × 0,155 m, vai 0,39 m, ngực dày 0,22 m, đáy chậu 0,80 m); FOV trong phòng 55°, camera lùi 3,6 m, cao +1,3 m; thêm va chạm với đồ nội thất (bỏ qua thảm, đồ thấp < 15 cm) | Chiều cao vốn đúng; người trông to do dáng mập, đầu to, hông cao và phối cảnh góc rộng | Agent | 2026-10-24 |
| DEC-48 | Bug: kẹt khi vào "Đứng trong phòng" (user báo 2026-10-24) | Nguyên nhân: tâm phòng trùng bàn ăn; va chạm chỉ xét cạnh đồ nên điểm trong lòng bàn bị coi là trống → người sinh ra trong bàn. Sửa: đồ là khối đặc; đang kẹt thì cho bước ra; chỗ đứng = điểm gần tâm đủ thoáng (≥ 0,7 m); hướng nhìn = hướng đi được xa nhất. Kiểm: quét tự động 57 phòng / 6 căn, phòng nào cũng đi ≥ 0,6 m và W đầu tiên ≥ 0,3 m | Hồi quy cần chạy lại khi đổi logic đi bộ (`?debug3d=1` + kịch bản quét) | Agent | 2026-10-24 |
| DEC-49 | Zoom (phản hồi user 2026-10-24) | Cuộn nhanh hơn (dollySpeed 1,4, trễ 0,22 s); chạm khoảng cách tối thiểu thì đi tiếp tới trước (không kẹt) nhưng camera giữ trong khối bao nhà, không xuống dưới đất; 2 nút ＋/− nổi trên khung 3D: bấm = 1 nấc, giữ = zoom liên tục (≈ 1,3×/giây). Sửa nút ＋ đang gọi ngược chiều | | Agent | 2026-10-24 |
| DEC-50 | Lỗi bố cục nhà mẫu (user phát hiện ở B2) | Hàm dựng nhà kẻ tường quanh mọi phòng → phòng bị cô lập. Thêm `open` (cặp phòng thông nhau) vào `floorFromRects`; sửa A2, B2 (không gian mở, cửa từ sảnh cầu thang, đổi chiều cầu thang, cửa ra sân thượng), C1 (cửa kho). Thêm kiểm `ROOM_UNREACHABLE` (cảnh báo khi gửi duyệt, lưới 100 mm, lối ≥ 0,4 m, xuất phát từ cửa chính tầng trệt hoặc đầu cầu thang); test bố cục nhà mẫu; `npm run seed -- --refresh-demo` để phát hành lại bố cục mới | Lỗi dựng tay của đội dựng cũng được bắt ở trình dựng | Agent | 2026-10-24 |
| DEC-51 | Đi cầu thang | Đứng trên cầu thang ở chế độ Đứng trong phòng → nút "↑ Lên / ↓ Xuống <tầng>"; đặt người ở đầu/chân cầu thang, trong một phòng của tầng đích. Hành lang hẹp: camera bị ép < 1 m thì tạm ẩn người mẫu | Chưa có leo bậc liên tục bằng phím | Agent | 2026-10-24 |
| DEC-52 | Lỗi di chuyển & không gian hẹp (user báo 2026-10-25, sau DEC-48…51) | Quét lại toàn bộ: (1) **va chạm tường bo tròn đầu** → đầu tường lấn vào khung cửa đúng nửa độ dày tường, cửa 0,9 m chỉ còn 0,7 m; (2) **xếp đồ nhà mẫu không biết cửa** → sofa chắn cửa chính C1, kệ TV chắn cửa bếp, tủ áo chắn cửa WC, ghế giữa sảnh; (3) **bấm sàn đi đường thẳng**, gặp tường là dừng; (4) đi phím chéo lệch tâm dính cạnh khung cửa (23/210 lần thử); (5) đầu cầu thang lên tầng lửng A1 / tầng 3 B2 nằm ngoài sàn. Sửa: module `packages/core/src/nav.ts` dùng chung cho người mẫu 3D, kiểm gửi duyệt và test — vật cản là khối hộp đúng kích thước (kính cửa sổ cũng chặn), thân người 0,2 m, A* có ưu tiên đi giữa lối, `auditFloor` (ROOM_UNREACHABLE / ROOM_NO_SPACE / NARROW_PASSAGE < 0,65 m / DOOR_BLOCKED / STAIR_BLOCKED / ROOM_CRAMPED); xếp đồ seed mới `seed/furnish.ts` (chừa 0,9 m trước cửa, hai đầu thang, đầu thang từ tầng dưới; tự bỏ đồ phụ ở chỗ hẹp); bấm sàn tự tìm đường; hỗ trợ đi qua cửa khi đi phím; sửa bố cục cầu thang A1 (lửng mở, thang về mặt tiền), B2 (sảnh tầng 3 hết chiều sâu). Kiểm: 4 nhà mẫu 0 lỗi; 57/57 chặng đi qua mọi phòng; 210/210 lần đi phím qua cửa; 5/5 cầu thang | Căn A-02 của khách còn 1 cảnh báo: đồ chắn trước cửa WC 01 (dữ liệu khách — chưa sửa, chờ user) | Agent | 2026-10-25 |
| DEC-37 | Spike GLB (ĐK của DEC-34) | ĐẠT: 2.000 mesh/40 vật liệu/30 item_ (15 lồng 3 cấp)/60 wall_ → 1,27 MB→52 KB, giữ đủ tên, phần không tên 40 draw call, tổng 220 (60 wall_ tốn draw call riêng → khuyến nghị gộp tường theo phòng). Spike phát hiện lỗi `join(keepNamed)` giữ mesh có tên → đã sửa. BE-R4 (file thật) vẫn mở | Mở khoá F12/F13 | Agent | 2026-10-24 |
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
| 2026-10-24 | Dev | Lát 1 xong (T-1…T-10): core, API khung, công khai, seed, viewer 3D, mặt bằng, PDF; 4 commit cục bộ |
| 2026-10-24 | Dev | Tài liệu nghiệp vụ lát 1 |
| 2026-10-24 | Dev | T-19: spike GLB đạt (DEC-37), pipeline tối ưu trong worker thread, API-37/38 |
