# Test Cases — Nhà mẫu online có bản vẽ · Phase 1

| | |
|---|---|
| QA | Agent (DEC-16) |
| Trạng thái | Ready |
| Nguồn | [SRS](../../system/SRS.md) v0.3 · [02](02-tech-spec.md) · [02a](02a-be-spec.md) · [02b](02b-fe-spec-web.md) |
| Build / môi trường | local (`npm run dev`), seed demo; thiết bị thật cho NFR-03 |
| Last update | 2026-10-24 · QA |

> **TL;DR**
> - 82 case xếp theo module; 48 case P1 (chặn release).
> - Tự động hoá: unit/integration (Vitest) cho mọi BR và API, E2E Playwright cho UC-05, UC-06, UC-08.
> - Thủ công: NFR trên thiết bị thật (Zalo/Facebook, máy tầm trung) và PDF in giấy.
> - Kết quả chạy: `04a-test-report.md`.

---

## 1. Phạm vi & chiến lược

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| Mọi FR Phase 1, AC-01…AC-15, BR-01…BR-12, EX-1…EX-13, NFR-01…NFR-10, ma trận quyền | FR Phase 2/3; tải thật (load test) |

| Mức | Phạm vi | Công cụ / lệnh | Tự động |
|---|---|---|:---:|
| Unit | core (diện tích, checks, phone, planSvg, budget), api lib | `npm test -w packages/core`, `-w apps/api` (Vitest) | ✔ |
| API / integration | Mọi API-xx, quyền, BR | `npm test -w apps/api` (`app.inject`, DB tạm) | ✔ |
| E2E / UI | V1→V2→mặt bằng→PDF→lead; studio→duyệt→phát hành | `npm run e2e` (Playwright Chrome, server thật + seed) | ✔ |
| NFR | Hiệu năng, tương thích, PDF in | Thủ công + script đo Playwright (throttle) | một phần |

**Dữ liệu test:**
- Integration: mỗi test file tạo DB `:memory:` và thư mục file tạm, xoá sau khi chạy.
- E2E: `DATA_DIR=./data-e2e`, seed demo (khách hàng "Sunrise Land", dự án `sunrise-garden`, 4 mẫu nhà), xoá thư mục sau khi chạy.
- Tiền tố dữ liệu tạo trong test: `e2e-`.

**Vào:** G2 ✅, build chạy được, seed chạy được. **Ra:** mọi AC và FR M có TC pass; bug Critical/High = 0.

## 2. Test cases

Ký hiệu KQ: ⬜ chưa chạy · ✅ pass · ❌ fail · ⛔ blocked.

### M01 — Khách hàng, dự án, tài khoản

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-01.01 | QTV tạo khách hàng | FR-01.01 | Happy | P1 | POST /clients name, màu `#0E6B5C`, hạn hosting | 201, status active | ⬜ |
| TC-01.02 | Màu sai định dạng | FR-01.01 | Negative | P2 | brandColor `green` | 400 VALIDATION_ERROR fields.brandColor | ⬜ |
| TC-01.03 | Tạo approver gửi E1 | FR-01.04, 01.05 | Happy | P1 | POST /users role approver + clientId | 201 status invited; outbox E1 có link `#token=` | ⬜ |
| TC-01.04 | Approver thiếu clientId | FR-01.04 | Negative | P2 | POST /users role approver | 400 | ⬜ |
| TC-01.05 | Email trùng (khác hoa thường) | FR-01.04 | Negative | P2 | Tạo `A@x.vn` rồi `a@x.vn` | 409 EMAIL_TAKEN | ⬜ |
| TC-01.06 | Đặt mật khẩu bằng token | FR-01.05 | Happy | P1 | POST /auth/password/set token hợp lệ, mk 8 ký tự | 200, cookie phiên, status active | ⬜ |
| TC-01.07 | Token hết hạn / đã dùng | FR-01.05 | Negative | P1 | Dùng token lần 2 | 400 TOKEN_INVALID | ⬜ |
| TC-01.08 | Khoá sau 5 lần sai | NFR-05 | Negative | P1 | Đăng nhập sai 5 lần, lần 6 đúng | Lần 6: 423 ACCOUNT_LOCKED | ⬜ |
| TC-01.09 | Vô hiệu user → phiên mất | NFR-05 | Negative | P1 | User có phiên; QTV PATCH disabled; user gọi /auth/me | 401 | ⬜ |
| TC-01.10 | Tạm ngưng khách hàng → approver bị đá + trang công khai gỡ | FR-01.06 | State | P1 | PATCH client suspended | approver /auth/me 401; GET public project 410 | ⬜ |
| TC-01.11 | Tạo dự án, slug trùng | FR-01.02 | Negative | P2 | Tạo 2 dự án cùng slug | 409 SLUG_TAKEN | ⬜ |
| TC-01.12 | Slug sai ký tự | FR-01.03 | Negative | P2 | slug `Sun_Rise!` | 400 | ⬜ |
| TC-01.13 | Slug khoá sau phát hành | FR-01.03, BR-02 | State | P1 | Phát hành 1 mẫu; PATCH slug dự án | 409 SLUG_LOCKED | ⬜ |
| TC-01.14 | Producer sửa email nhận lead | BR-11 | Permission | P1 | Producer PATCH /projects contact.leadEmails | 403 FIELD_FORBIDDEN | ⬜ |
| TC-01.15 | Không vô hiệu admin cuối | FR-01.04 | Negative | P3 | PATCH admin duy nhất disabled | 409 LAST_ADMIN | ⬜ |

### M02 — Tài liệu đầu vào

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-02.01 | Tải PDF mặt bằng | FR-02.01 | Happy | P1 | POST /projects/:id/files PDF 2 MB | 201 kind input; xuất hiện trong danh sách | ⬜ |
| TC-02.02 | Tệp sai loại | FR-02.01 | Negative | P2 | Tải `.exe` | 415 UNSUPPORTED_FILE | ⬜ |
| TC-02.03 | **File input không bao giờ công khai** | R-01, §6.2 | Permission | P1 | Phát hành mẫu có ảnh nền tầng; GET /files/<key ảnh nền> không cookie; với cookie approver | 404 cả hai; snapshot không có `underlay` | ⬜ |

### M03 — Dựng khung

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-03.01 | Diện tích phòng | BR-04, AC-06 | Boundary | P1 | Phòng 3.600 × 4.200 mm | 15,12 m² | ⬜ |
| TC-03.02 | Diện tích sàn theo đường bao | BR-04 | Boundary | P1 | outline 5.000 × 15.000 | 75,00 m² | ⬜ |
| TC-03.03 | Không có outline → cảnh báo | BR-04 | Negative | P3 | Bỏ outline | check FLOOR_NO_OUTLINE warn, diện tích theo bbox tường | ⬜ |
| TC-03.04 | Hiệu chỉnh tỷ lệ | FR-03.03 | Happy | P1 | Trong A3: vẽ đoạn 200 px, nhập 5.000 mm | mmPerPx = 25; tầng "Đã hiệu chỉnh"; kích thước hiện | ⬜ |
| TC-03.05 | Vẽ tường, phòng, cửa | FR-03.04, 03.08 | Happy | P1 | Vẽ 4 tường, phòng, 1 cửa đi, 1 cửa sổ | Kích thước hiện khi vẽ; 3D và mặt bằng cập nhật | ⬜ |
| TC-03.06 | Phòng chưa khép kín | UC-02 EX | Negative | P2 | Đa giác tự cắt | ROOM_NOT_CLOSED block, tô đỏ | ⬜ |
| TC-03.07 | Nhiều tầng + lửng + sân thượng | FR-03.02, P4 | Happy | P1 | Tạo 4 tầng + lửng | Sắp theo cao độ; tối đa 10 (tầng 11 → lỗi) | ⬜ |
| TC-03.08 | Cầu thang + khu vực ngoài nhà | FR-03.05, 03.06 | Happy | P2 | Đặt cầu thang T1→T2, sân vườn, hồ bơi | Hiện ở mặt bằng và 3D | ⬜ |
| TC-03.09 | Sao chép tầng / mẫu nhà | FR-03.09 | Happy | P2 | Sao chép T2; sao chép mẫu nhà | id mới, nội dung giống; tham chiếu cửa → tường đúng | ⬜ |
| TC-03.10 | Autosave + xung đột | API-35 | State | P1 | 2 tab cùng sửa; tab 2 lưu sau | Tab 2: 409 REVISION_CONFLICT, hộp "Tải lại" | ⬜ |
| TC-03.11 | Lưu tài liệu tham chiếu sai | R-34 | Negative | P2 | Cửa trỏ wallId không tồn tại | 400 DOCUMENT_INVALID (path) | ⬜ |
| TC-03.12 | Hoàn tác / làm lại | FR-03.08 | Happy | P2 | Vẽ tường, Ctrl+Z, Ctrl+Shift+Z | Mất rồi hiện lại | ⬜ |

### M04 — Mô hình hiển thị

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-04.01 | Tải GLB → tối ưu → báo cáo | FR-04.01–02 | Happy | P1 | Tải GLB tổng hợp (spike) | ready; report có triangles, drawCalls, textureBytes, fileBytes; giữ node `item_*`, `wall_*` | ⬜ |
| TC-04.02 | GLB hỏng | EX-1 | Negative | P1 | Tải file `.glb` rác | failed, error tiếng Việt | ⬜ |
| TC-04.03 | Vượt ngân sách chặn gửi duyệt | BR-07, EX-2, AC-07 | Negative | P1 | Tầng có tổng > 14 MB | submit 422 BUDGET_BLOCK floorId đúng | ⬜ |
| TC-04.04 | Căn mô hình + cảnh báo lệch | FR-04.03, EX-4 | Happy | P2 | Lệch 300 mm | Cảnh báo "Mô hình lệch khung 300 mm…" | ⬜ |
| TC-04.05 | Tầng không có GLB → khối từ khung | FR-04.04, EX-5 | Happy | P1 | Mẫu không gắn GLB | 3D hiện tường, sàn, cửa | ⬜ |
| TC-04.06 | Điểm nhìn mặc định, đêm, ảnh đại diện | FR-04.05–07 | Happy | P2 | Đặt điểm nhìn mặc định; bật Đêm; chụp ảnh | V2 mở đúng góc; có nút Ngày/Đêm; ảnh ở V1 | ⬜ |
| TC-04.07 | Node đồ bị mất sau khi thay GLB | 02 §5.3 | Negative | P2 | Gắn đồ theo node, thay GLB không có node đó | MODEL_NODE_MISSING block | ⬜ |

### M05 — Đồ & thư viện

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-05.01 | Tạo đồ thư viện có biến thể | FR-05.01 | Happy | P1 | POST /library/items | 201; xuất hiện ở A4 | ⬜ |
| TC-05.02 | Đặt đồ từ thư viện, tự gán phòng | FR-05.02, 05.04 | Happy | P1 | Đặt giường vào PN1 | Đồ thuộc PN1; hiện trong V2 | ⬜ |
| TC-05.03 | Gắn thông tin cho node GLB | FR-05.03 | Happy | P1 | Chọn `item_sofa` → nhập thông tin | Bấm sofa ở V2 → chi tiết đúng | ⬜ |
| TC-05.04 | Xoá đồ đang dùng | API-41 | Negative | P2 | DELETE đồ đang dùng | 409 ITEM_IN_USE usage ≥ 1 | ⬜ |
| TC-05.05 | Đổi biến thể ở V2 | FR-05.05 | Happy | P3 | Bấm màu khác | Màu 3D đổi | ⬜ |

### M06 — Trang xem 3D

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-06.01 | V1 danh sách + lọc loại nhà | FR-06.01 | Happy | P1 | Mở `/v/sunrise-garden`, lọc Biệt thự | Chỉ thẻ biệt thự; chip chỉ hiện loại có mẫu | ⬜ |
| TC-06.02 | V1 trống | §10.4 V1 | UI | P3 | Dự án chưa phát hành mẫu nào | Chữ "Dự án đang cập nhật mẫu nhà…" | ⬜ |
| TC-06.03 | Chọn tầng ẩn tầng trên | FR-06.03, AC-02 | Happy | P1 | Nhà phố 4 tầng, chọn T2 | T3, T4, mái ẩn; camera ≤ 1 giây; "Cả nhà" hiện lại đủ | ⬜ |
| TC-06.04 | Chọn phòng, tường hạ | FR-06.05–06, AC-03 | Happy | P1 | Bấm sàn PN1 | Camera tới phòng; tường giữa camera và phòng hạ thấp | ⬜ |
| TC-06.05 | Cắt tường trên tầng GLB | FR-06.06, DEC-29 | Happy | P2 | Tầng có `wall_*`, Tự cắt | Node `wall_*` phía camera ẩn; Tường thấp = cắt 1,2 m | ⬜ |
| TC-06.06 | Đứng trong phòng | FR-06.07, AC-03 | Happy | P1 | Bật chế độ | Camera 1,6 m trên sàn tầng; kéo nhìn quanh; chạm sàn phòng khác → di chuyển | ⬜ |
| TC-06.07 | Bấm đồ → chi tiết | FR-06.08, AC-04 | Happy | P1 | Bấm giường | Tên, kích thước mm, chất liệu đúng dữ liệu | ⬜ |
| TC-06.08 | Danh sách đồ theo phòng | FR-06.09 | Happy | P3 | Bấm mục danh sách | Camera tới đồ, mở chi tiết | ⬜ |
| TC-06.09 | Miễn trừ luôn hiện | FR-06.11, BR-06 | Happy | P1 | V1, V2, V4, PDF | Có câu miễn trừ (mặc định hoặc theo dự án) | ⬜ |
| TC-06.10 | Không WebGL → dự phòng | FR-06.12, AC-15, EX-8 | Negative | P1 | Chrome `--disable-webgl` | V4: ảnh, gallery, mặt bằng, liên hệ; sự kiện fallback_shown | ⬜ |
| TC-06.11 | Tải chậm | EX-9 | Negative | P3 | Throttle 1 Mbps | Thanh tiến trình; sau 15 giây gợi ý "Xem mặt bằng" | ⬜ |
| TC-06.12 | Không khả dụng | EX-10 | Negative | P1 | Slug sai; dự án hết hạn > 7 ngày | V4 "Nội dung này hiện không còn hiển thị." | ⬜ |
| TC-06.13 | Link sâu | FR-06.15 | Happy | P3 | `?floor=…&room=…` | Mở đúng tầng/phòng | ⬜ |
| TC-06.14 | Chia sẻ / toàn màn hình | FR-06.14 | Happy | P3 | Bấm Sao chép link | Toast "Đã sao chép link" | ⬜ |
| TC-06.15 | Mobile 360 px | §10.4 V2, DEC-13/14 | UI | P2 | Viewport 360×780 | Chip tầng, ngăn kéo, thanh liên hệ đáy; không cuộn ngang | ⬜ |
| TC-06.16 | Meta mẫu nhà lấy từ bản duyệt | DEC-28 | State | P2 | Sửa declaredArea sau khi phát hành | Trang công khai vẫn diện tích cũ tới khi phát hành lại | ⬜ |

### M07 — Mặt bằng

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-07.01 | Mặt bằng có đủ thành phần | FR-07.01–02, AC-05 | Happy | P1 | Tab Mặt bằng | Tường đúng độ dày, cung cửa, cửa sổ, cầu thang, tên + diện tích phòng, kích thước tổng và từng phòng (mm) | ⬜ |
| TC-07.02 | Bấm phòng trên mặt bằng | FR-07.03 | Happy | P2 | Bấm PN1 | Về 3D tại PN1 | ⬜ |
| TC-07.03 | PDF đúng tỷ lệ | FR-07.04, NFR-08 | NFR | P1 | Tải PDF, in A3, đo tường 4.000 mm ở 1:100 | 40 mm ± 0,2 mm; có tên dự án, tầng, logo, ngày, miễn trừ; dấu tiếng Việt đúng | ⬜ |
| TC-07.04 | PDF trong Zalo | R-10 | Negative | P2 | Mở V2 trong Zalo, bấm Tải PDF | Hộp "Mở bằng trình duyệt để tải PDF" + Sao chép link | ⬜ |
| TC-07.05 | XSS tên phòng | R-16 | Negative | P1 | Tên phòng `<img src=x onerror=alert(1)>` | Hiện nguyên chữ, không chạy script | ⬜ |
| TC-07.06 | Mặt bằng tự cập nhật | FR-07.05, BR-12 | Happy | P2 | Sửa khung | Mặt bằng đổi theo; không có công cụ sửa trên mặt bằng | ⬜ |

### M08 — Duyệt & phát hành

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-08.01 | Gửi duyệt bị chặn | FR-08.02, BR-05, AC-07 | Negative | P1 | Tầng 3 chưa hiệu chỉnh → submit | 422 SUBMIT_BLOCKED, check FLOOR_NOT_CALIBRATED floorId T3; A5 hiện "Tầng 3 chưa hiệu chỉnh tỷ lệ" | ⬜ |
| TC-08.02 | Luồng duyệt đầy đủ | UC-05, AC-08 | Happy | P1 | submit → E3 → approver duyệt → QTV phát hành | Trạng thái đúng từng bước; link công khai hiện bản mới | ⬜ |
| TC-08.03 | Yêu cầu sửa | FR-08.04, AC-08 | State | P1 | Approver yêu cầu sửa, ghi chú 12 ký tự | Version draft; A3 hiện dải ghi chú; review lưu | ⬜ |
| TC-08.04 | Ghi chú quá ngắn | FR-08.04 | Negative | P2 | Ghi chú 5 ký tự | 400 VALIDATION_ERROR | ⬜ |
| TC-08.05 | Bản ghi duyệt bất biến | FR-08.05, BR-03 | Negative | P1 | UPDATE/DELETE trực tiếp reviews, submissions.snapshot | SQLite ABORT | ⬜ |
| TC-08.06 | Duyệt 2 lần | INVALID_STATE | Negative | P1 | Gửi review 2 lần song song | Một 200, một 409 | ⬜ |
| TC-08.07 | Phát hành thay bản cũ, link giữ | BR-02, AC-09 | State | P1 | v2 published; phát hành v3 | Cùng URL hiện v3; v2 superseded; one_published giữ | ⬜ |
| TC-08.08 | Phát hành bản chưa duyệt | BR-01 | Negative | P1 | publish khi pending_review | 409 INVALID_STATE | ⬜ |
| TC-08.09 | Duyệt thay có bằng chứng | FR-08.07, EX-7 | Happy | P2 | QTV review-on-behalf thiếu file | 400; có file → 200 on_behalf=1 | ⬜ |
| TC-08.10 | Gỡ & khôi phục | FR-08.08 | State | P2 | unpublish → publish lại bản cũ | V4 khi gỡ; hiện lại khi khôi phục | ⬜ |
| TC-08.11 | Nhắc duyệt sau 5 ngày làm việc | FR-08.09, EX-6 | Job | P3 | submitted Thứ 6 10:00; giả lập thời gian Thứ 6 tuần sau 11:00 | E4 một lần | ⬜ |
| TC-08.12 | C3 sau khi rút về | R-11 | State | P2 | QTV withdraw; approver mở link E3 | "Phiên bản này đã được nhà cung cấp rút lại để chỉnh sửa." | ⬜ |
| TC-08.13 | Nội dung duyệt = nội dung công khai | P6, R-12 | State | P1 | Duyệt v3; sửa thư viện đồ sau đó | Trang công khai vẫn thông tin cũ; snapshotHash của review = submission | ⬜ |

### M09 — Thương hiệu & chia sẻ

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-09.01 | Logo, màu khách hàng | FR-09.01, AC-10 | Happy | P1 | Mở V1, V2 | Logo, màu chủ đạo; "Powered by" theo cấu hình | ⬜ |
| TC-09.02 | Mã nhúng chạy | FR-09.02, AC-10 | Happy | P1 | Dán iframe vào trang HTML khác (localhost:9000) | Hiển thị; nguồn `embed` trong thống kê | ⬜ |
| TC-09.03 | QR | FR-09.03, 09.04 | Happy | P1 | Tải QR, quét | Mở link có `?src=qr`; nguồn `qr` | ⬜ |
| TC-09.04 | Đổi logo sau phát hành | DEC-28, R-02 | State | P2 | Đổi logo khách hàng | Trang công khai hiện logo mới (file công khai) | ⬜ |

### M10 — Lead

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-10.01 | Gửi lead hợp lệ | FR-10.02–04, AC-11 | Happy | P1 | Điền tên, `+84 912 345 678`, đồng ý | 201; SĐT lưu `0912345678`; email E5 ≤ 5 phút; ngữ cảnh tầng/phòng đúng | ⬜ |
| TC-10.02 | Gộp trùng 24 giờ | BR-09, EX-12, AC-11 | Boundary | P1 | Gửi lại cùng SĐT sau 3 giờ; sau 25 giờ | 3 giờ: merged, count = 2; 25 giờ: lead mới | ⬜ |
| TC-10.03 | SĐT sai | BR-09, EX-11 | Negative | P1 | `091234` | 400; chữ "Số điện thoại cần 10 chữ số…" | ⬜ |
| TC-10.04 | Thiếu đồng ý | FR-10.02, NFR-04 | Negative | P1 | Bỏ tick | 400; "Bạn cần đồng ý…" | ⬜ |
| TC-10.05 | Chống spam | EX-13, R-13 | Negative | P1 | 4 lần/10 phút cùng deviceId; formToken < 3 giây; website khác rỗng | Lần 4 → 429 CAPTCHA_REQUIRED; token nhanh → 429; honeypot → 201 giả, không lưu | ⬜ |
| TC-10.06 | Lead của dự án đã gỡ | API-62 | Negative | P2 | Gửi khi dự án suspended | 410 | ⬜ |
| TC-10.07 | Xem, đánh dấu, CSV | FR-10.05 | Happy | P1 | C4: lọc, Đã liên hệ, Tải CSV | CSV UTF-8 BOM đủ cột; ô `=1+1` thành `'=1+1` | ⬜ |
| TC-10.08 | Xoá lead | NFR-04, R-26 | Happy | P2 | Xoá lead | Không còn trong DB; outbox E5 của lead bị che | ⬜ |

### M11 — Thống kê

| ID | Tiêu đề | Phủ | Loại | Ưu tiên | Bước | Kỳ vọng | KQ |
|---|---|---|---|:---:|---|---|:---:|
| TC-11.01 | Ghi sự kiện | FR-11.01 | Happy | P1 | Đi qua V1→V2→tầng→phòng→đồ→mặt bằng→liên hệ | Đủ loại sự kiện trong view_events | ⬜ |
| TC-11.02 | Báo cáo khớp kịch bản | FR-11.02, AC-13 | Happy | P1 | Tạo 20 phiên thử có kịch bản (12 thiết bị, 2 lead) | views 20, uniqueViewers 12, leads 2, leadRate 0,1; top phòng đúng | ⬜ |
| TC-11.03 | Phiên 30 phút | BR-10 | Boundary | P2 | Sự kiện 9:00, 9:20, 10:00 | 2 lượt | ⬜ |
| TC-11.04 | Xem trước không tính | 02b §11 | Negative | P2 | Mở C3 | Không có sự kiện | ⬜ |
| TC-11.05 | Rate limit events | R-29 | Negative | P3 | 121 lô/phút | 429 | ⬜ |
| TC-11.06 | Trống | §10.4 C5 | UI | P3 | Dự án mới | "Chưa có lượt xem…" + "Lấy link & QR" | ⬜ |

## 3. Phân quyền

| Hành động | QTV | Người dựng | Người duyệt (KH A) | Người xem | TC |
|---|:---:|:---:|:---:|:---:|---|
| CRUD khách hàng, tài khoản | ✅ | ⛔ 403 | ⛔ 403 | ⛔ 401 | TC-P.01 |
| Sửa dự án (field nội dung) | ✅ | ✅ | ⛔ 403 | ⛔ 401 | TC-P.02 |
| Sửa liên hệ / email lead / miễn trừ | ✅ | ⛔ 403 FIELD_FORBIDDEN | ⛔ | ⛔ | TC-01.14 |
| Lưu tài liệu mẫu nhà | ✅ | ✅ | ⛔ 403 | ⛔ 401 | TC-P.03 |
| Gửi duyệt / phát hành / gỡ | ✅ | ⛔ 403 | ⛔ 403 | ⛔ | TC-P.04 |
| Duyệt phiên bản KH A | ⛔ (chỉ duyệt thay) | ⛔ 403 | ✅ | ⛔ | TC-P.05 |
| Duyệt phiên bản KH B | — | ⛔ | ⛔ 403 | ⛔ | TC-P.06 (AC-12) |
| Xem preview KH B | ✅ | ✅ | ⛔ 403 | ⛔ | TC-P.06 |
| Xem/tải lead KH A | ✅ | ⛔ 403 | ✅ | ⛔ | TC-P.07 |
| Xem lead/thống kê KH B | ✅ | ⛔ | ⛔ 403 | ⛔ | TC-P.07 (AC-12) |
| Đọc file evidence KH A | ✅ | ✅ | ✅ | ⛔ 404 | TC-P.08 |
| Đọc file input | ✅ | ✅ | ⛔ 404 | ⛔ 404 | TC-02.03 |
| CSRF: POST không có `X-Requested-With` | ⛔ 403 CSRF | | | | TC-P.09 |

## 4. Phi chức năng

| ID | NFR | Kịch bản & tải | Ngưỡng đạt | Kết quả đo |
|---|---|---|---|---|
| TC-N.01 | NFR-01 | 3 mẫu AC-14, throttle 10 Mbps, Chrome mobile emulation + máy thật | Hình đầu ≤ 5 giây; tầng đầu đầy đủ ≤ 10 giây; tải lần đầu ≤ 15 MB | |
| TC-N.02 | NFR-02 | Xoay 30 giây trên máy tầm trung | FPS TB ≥ 30; chuyển tầng ≤ 1 giây | |
| TC-N.03 | NFR-03 | Chrome, Safari, Edge; Safari iOS 16+; Chrome Android 10+; Zalo + Facebook in-app iOS/Android; 360 px | Mở được, thao tác chính chạy | |
| TC-N.04 | NFR-05 | Quét header (CSP, cookie Secure/HttpOnly, no-referrer) | Đúng 02 §8 | |
| TC-N.05 | NFR-08 | PDF in A3 | sai ≤ 0,5% | |
| TC-N.06 | NFR-09 | Sao lưu `VACUUM INTO` + khôi phục | ≤ 4 giờ, dữ liệu đủ | |
| TC-N.07 | NFR-07 | Bấm giờ dựng khung căn hộ 2PN và nhà phố 4 tầng | ≤ 2 giờ / ≤ 1 ngày | |
| TC-N.08 | NFR-10 | Soát giao diện | Tiếng Việt có dấu đủ; số `15,12 m²` | |

## 5. Truy vết

| FR / AC / BR | TC | Đạt |
|---|---|:---:|
| AC-01 | TC-N.07, E2E seed 4 mẫu, TC-03.07, TC-04.01 | ⬜ |
| AC-02 | TC-06.03 | ⬜ |
| AC-03 | TC-06.04, TC-06.06 | ⬜ |
| AC-04 | TC-06.07 | ⬜ |
| AC-05 | TC-07.01, TC-07.03 | ⬜ |
| AC-06 | TC-03.01 | ⬜ |
| AC-07 | TC-08.01, TC-04.03 | ⬜ |
| AC-08 | TC-08.02, TC-08.03 | ⬜ |
| AC-09 | TC-08.07 | ⬜ |
| AC-10 | TC-09.01, TC-09.02, TC-09.03, TC-06.09 | ⬜ |
| AC-11 | TC-10.01, TC-10.02, TC-10.03 | ⬜ |
| AC-12 | TC-P.06, TC-P.07 | ⬜ |
| AC-13 | TC-11.02 | ⬜ |
| AC-14 | TC-N.01, TC-N.02, TC-N.03 | ⬜ |
| AC-15 | TC-06.10 | ⬜ |
| BR-01…BR-12 | TC-08.08 · TC-08.07 · TC-08.05 · TC-03.01/02 · TC-08.01 · TC-06.09 · TC-04.03 · TC-01.10/TC-06.12 · TC-10.02/03 · TC-11.03 · TC-P.* · TC-07.06 | ⬜ |
| EX-1…EX-13 | TC-04.02 · TC-04.03 · TC-03.04 · TC-04.04 · TC-04.05 · TC-08.11 · TC-08.09 · TC-06.10 · TC-06.11 · TC-06.12 · TC-10.03 · TC-10.02 · TC-10.05 | ⬜ |
| FR M01–M11 | Bảng §2 theo module | ⬜ |

## Chốt G4
- [ ] Mọi AC và FR mức M có ≥ 1 TC pass, có bằng chứng
- [ ] Ma trận quyền đã chạy
- [ ] NFR có ngưỡng đã đo
- [ ] Bug Critical/High = 0 (hoặc có DEC chấp nhận)
- [ ] Regression vùng bị chạm đã chạy
