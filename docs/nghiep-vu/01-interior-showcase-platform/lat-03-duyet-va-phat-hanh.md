# Lát 3 — Duyệt và phát hành — Giải thích nghiệp vụ

| Trường | Giá trị |
|---|---|
| Item / lát | `01-interior-showcase-platform` · lát 3 (T-22…T-24) |
| Yêu cầu | FR-08.01–08.09, FR-09.02–09.03; BR-01, BR-02, BR-03; R-01, R-04, R-11 ([SRS](../../ai/system/SRS.md)) |
| Code | commit `b09c22b`, `df4668e` (nhánh `feat/01-interior-showcase-platform`) |
| Người đọc | Dev mới vào dự án, reviewer, QA |
| Tác giả | Agent (DEC-16) |
| Reviewer | PO · Tech lead |
| Trạng thái | Draft |
| Last update | 2026-10-24 · Dev |

## TL;DR
- Không có gì lên trang công khai nếu **chủ đầu tư chưa duyệt**. Đội mình gửi duyệt, người duyệt bên khách xem trước rồi chọn duyệt hoặc yêu cầu sửa, sau đó quản trị viên mới phát hành.
- Thứ người duyệt nhìn thấy được **đóng băng** lúc gửi (gọi là snapshot). Bản phát hành chính là bản đóng băng đó, không phải bản đội dựng sửa sau.
- Mọi lần gửi, duyệt, yêu cầu sửa, duyệt thay đều được lưu vĩnh viễn kèm người và giờ, không sửa hay xoá được.
- Chờ duyệt quá 5 ngày làm việc thì hệ thống gửi email nhắc **một lần**.

## 0. Giải thích đơn giản

Giống quy trình duyệt maquette quảng cáo: agency in bản proof, khách ký lên proof, nhà in in đúng bản đã ký. Ở đây:

1. **Gửi duyệt** (quản trị viên, màn A5): hệ thống kiểm lại lần cuối (thiếu ảnh đại diện, chưa hiệu chỉnh tỷ lệ… thì không cho gửi), chụp lại toàn bộ mẫu nhà thành một bản đóng băng, và gửi email "cần bạn duyệt" cho người duyệt bên khách.
2. **Xem trước** (người duyệt, màn C3): mở link trong email, thấy đúng trang mà người mua sẽ thấy, có dải "BẢN XEM TRƯỚC" ở trên và thanh duyệt ở dưới.
3. **Quyết định:**
   - *Duyệt*: phải xác nhận lại một lần. Từ đó bản này được phép công khai.
   - *Yêu cầu sửa*: phải ghi ít nhất 10 ký tự, có thể đánh dấu tầng hoặc phòng liên quan. Mẫu nhà quay về trạng thái Đang dựng để đội mình sửa.
4. **Phát hành** (quản trị viên): bản đã duyệt lên link công khai. Nếu đang có bản cũ công khai thì bản cũ chuyển sang "Đã thay thế". Link và QR giữ nguyên.

### Ví dụ một vòng đầy đủ
1. Chị Hà dựng xong "Nhà phố 5×15". Quản trị viên bấm **Gửi khách duyệt**, anh Tuấn bên An Phát nhận email.
2. Anh Tuấn mở link, xoay xem nhà, thấy bàn làm việc đặt nhầm phòng. Anh bấm **Yêu cầu sửa**, ghi "Đổi bàn làm việc sang phòng ngủ, thêm sofa", tick "Tầng 1". Mẫu nhà về Đang dựng.
3. Chị Hà sửa xong, quản trị viên gửi lại (lần 2). Anh Tuấn bấm **Duyệt phiên bản này** → **Xác nhận duyệt**.
4. Quản trị viên bấm **Phát hành**. Link `/v/an-phat-riverside/nha-pho-5x15` hiện phiên bản 1.
5. Một tháng sau An Phát đổi màu sơn. Quản trị viên bấm **Tạo phiên bản mới**, chị Hà sửa trên phiên bản 2. Trong lúc đó khách vẫn xem phiên bản 1. Phiên bản 2 được duyệt và phát hành thì phiên bản 1 chuyển sang "Đã thay thế".

## 1. Vì sao cần
- Quảng cáo nhà ở có rủi ro pháp lý: hình ảnh, diện tích sai thì chủ đầu tư bị khiếu nại. Chủ đầu tư phải là người cho phép công khai, và phải có bằng chứng là họ đã cho phép.
- Khách hay duyệt qua Zalo thay vì đăng nhập. Đội mình cần cách ghi nhận việc đó có bằng chứng.
- Nếu không đóng băng bản duyệt, đội dựng có thể sửa sau khi khách duyệt, và thứ lên công khai sẽ khác thứ khách đã thấy.

| Lát này làm | Lát này không làm |
|---|---|
| Gửi duyệt, rút về, duyệt, yêu cầu sửa, duyệt thay có bằng chứng, phát hành, gỡ, khôi phục, tạo phiên bản mới · E3, E4 · màn A5, C2, C3 | Lead, thống kê (lát 4) · nhiều cấp duyệt, nhiều người phải cùng duyệt (chưa có yêu cầu) · so sánh khác biệt giữa hai phiên bản (Phase 2) |

## 2. Ai dùng, ở đâu, khi nào
| Vai | Màn hình / điểm vào | Lúc nào dùng |
|---|---|---|
| Quản trị viên | `/studio/houses/<id>/versions` (A5) | Gửi duyệt, ghi nhận duyệt thay, phát hành, gỡ |
| Người dựng | A5 chỉ xem; nút "Xem trước" trong trình dựng | Theo dõi trạng thái |
| Người duyệt (bên khách) | Email E3/E4 → `/portal/review/<versionId>` (C3); `/portal` (C2) | Khi có bản chờ duyệt; lấy link, mã nhúng, QR |

## 3. Tình huống thực tế
| # | Tình huống | Hệ thống làm gì | Vì sao |
|---|---|---|---|
| 1 | Gửi duyệt khi còn thiếu ảnh đại diện | Không gửi, hiện danh sách lý do, bấm vào lý do là mở trình dựng | Không để khách duyệt một bản chưa hoàn chỉnh |
| 2 | Đang chờ duyệt thì đội dựng phát hiện lỗi | Quản trị viên bấm "Rút về để sửa". Người duyệt mở link thì thấy "đã được nhà cung cấp rút lại" | Người duyệt không duyệt nhầm bản sắp thay đổi |
| 3 | Người duyệt mở lại link sau khi đã yêu cầu sửa | Thấy "Phiên bản 1 đã được yêu cầu sửa lúc … bởi …", không thấy bản nháp đang sửa | Bản nháp là việc nội bộ của đội dựng (R-11) |
| 4 | Hai người duyệt cùng bấm duyệt | Người thứ hai nhận "Phiên bản đã được xử lý", trang tải lại | Mỗi lần gửi chỉ có một quyết định |
| 5 | Khách duyệt qua Zalo | Quản trị viên "Ghi nhận duyệt thay", bắt buộc tải ảnh chụp/PDF và ghi chú ≥ 10 ký tự | Vẫn có bằng chứng như khi khách tự bấm |
| 6 | Người duyệt của khách hàng khác mở link | "Bạn không có quyền xem dự án này" | Dữ liệu chủ đầu tư này không lộ sang chủ đầu tư khác |
| 7 | Gửi duyệt chiều Thứ 6, chưa ai duyệt | Thứ 6 tuần sau (đủ 5 ngày làm việc, bỏ T7, CN) gửi email nhắc E4, chỉ một lần | Nhắc mà không làm phiền |
| 8 | Gỡ phát hành | Link công khai báo không còn; bấm "Khôi phục phát hành" để hiện lại bản đó, không cần duyệt lại | Bản đó đã được duyệt rồi |

## 4. Luồng ví dụ từ đầu đến cuối
```mermaid
sequenceDiagram
    actor Q as Quản trị viên
    participant A as Máy chủ
    actor T as Anh Tuấn (người duyệt)
    Q->>A: Gửi khách duyệt (A5)
    A->>A: kiểm lỗi chặn → đóng băng snapshot (bỏ ảnh nền) → Chờ duyệt
    A-->>T: Email E3 "Nhà phố 5×15 phiên bản 1 cần bạn duyệt"
    T->>A: mở C3 → xem trước (từ snapshot)
    T->>A: Yêu cầu sửa + ghi chú + Tầng 1
    A->>A: lưu quyết định → Đang dựng
    Q->>A: sửa xong, gửi lại (lần 2)
    T->>A: Duyệt phiên bản này → Xác nhận
    A->>A: lưu quyết định → Đã duyệt
    Q->>A: Phát hành
    A->>A: bản cũ (nếu có) → Đã thay thế; mẫu nhà → phiên bản 1; khoá đường dẫn
```

## 5. Quy tắc nghiệp vụ và lý do
| Quy tắc | Con số / điều kiện | Vì sao | ID |
|---|---|---|---|
| Chỉ công khai bản đã duyệt | Phát hành chỉ được khi lần gửi hiện tại có quyết định "Duyệt" | An toàn pháp lý | BR-01 |
| Mỗi mẫu nhà tối đa 1 bản công khai, 1 bản đang mở (Đang dựng / Chờ duyệt / Đã duyệt) | Ràng buộc ở cơ sở dữ liệu | Không có hai bản cùng "đang công khai" | BR-02 |
| Bản Chờ duyệt bị khoá sửa | Lưu → 409 VERSION_LOCKED | Thứ khách đang xem phải đứng yên | BR-03 |
| Snapshot không chứa ảnh nền mặt bằng | Ảnh nền bị bỏ khi đóng băng | Bản vẽ gốc là tài liệu riêng của chủ đầu tư | R-01 |
| Lần gửi và quyết định là bất biến | Có trigger chặn sửa/xoá; chỉ được ghi giờ rút về và giờ đã nhắc | Bằng chứng không bị sửa về sau | R-04 |
| Yêu cầu sửa, duyệt thay cần ghi chú | ≥ 10 ký tự; duyệt thay cần thêm tệp bằng chứng của đúng dự án | Ghi chú phải đủ để đội dựng hiểu cần sửa gì | FR-08.05, 08.07 |
| Nhắc duyệt | ≥ 5 ngày làm việc (giờ VN, bỏ T7, CN), một lần mỗi lần gửi | Không làm phiền | FR-08.09 |
| Người duyệt không xem được bản nháp | Bản nháp → chỉ thấy trạng thái và quyết định gần nhất | Việc đang làm dở là nội bộ | R-11 |
| Đường dẫn khoá sau lần phát hành đầu | Mẫu nhà và dự án | QR đã in vẫn dùng được | FR-01.03 |

## 6. Điểm dễ hiểu nhầm
- **"Duyệt xong là lên công khai luôn?"** Không. Duyệt chỉ là *cho phép*. Quản trị viên quyết định lúc nào phát hành, ví dụ chờ ngày mở bán.
- **"Đội dựng sửa sau khi khách duyệt thì sao?"** Không sửa được: bản Đã duyệt bị khoá. Muốn sửa thì phát hành rồi tạo phiên bản mới, hoặc nhờ khách yêu cầu sửa.
- **"Logo, số điện thoại đổi sau khi duyệt có cần duyệt lại không?"** Không. Thương hiệu và liên hệ lấy bản hiện tại lúc hiển thị (DEC-28). Chỉ nội dung nhà nằm trong snapshot.
- **"Khôi phục phát hành có cần duyệt lại không?"** Không, vì bản đó đã có quyết định duyệt.
- **"Vì sao người dựng không gửi duyệt được?"** Gửi duyệt là việc với khách hàng, do quản trị viên chịu trách nhiệm. Người dựng chỉ làm nội dung.

## 7. Bản đồ nghiệp vụ → code
| Khái niệm nghiệp vụ | Code | Test chứng minh |
|---|---|---|
| Chuyển trạng thái, snapshot, phát hành thay bản cũ | `apps/api/src/services/workflow.ts`, `services/snapshot.ts` | `apps/api/test/workflow.test.ts` |
| Route API-39, 50…55 | `apps/api/src/routes/workflow.ts` | `workflow.test.ts` — "gửi duyệt khi còn lỗi chặn…", "duyệt thay cần bằng chứng…", "phiên bản 2 phát hành thay phiên bản 1…" |
| Xem trước bỏ ảnh nền, chặn người duyệt xem nháp | `routes/workflow.ts` (preview) | `workflow.test.ts` — "xem trước bản nháp…" |
| Nhắc duyệt E4 | `services/workflow.ts` (`remindDue`), `jobs/handlers.ts`, `lib/time.ts` | `workflow.test.ts` — "E4: nhắc một lần…" |
| Màn A5 | `apps/web/src/app/studio/Versions.tsx` | Playwright: gửi → yêu cầu sửa → gửi lại → duyệt → phát hành → trang công khai 200 |
| Màn C2, C3 | `apps/web/src/app/portal/PortalHome.tsx`, `portal/Review.tsx` | Như trên (E2E chính thức ở T-30) |

## 8. Giới hạn hiện tại và giả định
- Mỗi khách hàng có thể có nhiều người duyệt; **một người duyệt là đủ**. Chưa có yêu cầu nhiều người phải cùng duyệt.
- Đánh dấu tầng/phòng khi yêu cầu sửa mới chỉ lưu và hiện trong lịch sử. Trình dựng chưa tô sáng các vị trí đó.
- Trang C3 dùng lại trang xem công khai, nên nút "Liên hệ tư vấn" vẫn hiện trong bản xem trước.

## Liên kết
- SRS: [`docs/ai/system/SRS.md`](../../ai/system/SRS.md) §4.5, §5.8, §7, §10.4 (A5, C2, C3)
- Spec: `02` §5.4, §6 API-39, 50…55; `02a` §4, §7; `02b` F14, F15
- Test cases: `04` TC-08.*
