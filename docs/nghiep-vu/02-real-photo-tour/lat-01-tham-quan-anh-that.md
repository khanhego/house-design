# Tham quan ảnh thật — Giải thích nghiệp vụ

| Trường | Giá trị |
|---|---|
| Item / lát | `02-real-photo-tour` · một lát (T2-1…T2-6) |
| Yêu cầu | FR-12.01–12.13, BR-T1–T5, NFR-T1–T4, EX-T1–T6 ([SRS item 02](../../ai/items/02-real-photo-tour/01-srs.md)); sửa FR-08.02, FR-06.01 (CR-2) |
| Code | commit `6226bb9`, `afe5323` (nhánh `feat/01-interior-showcase-platform`) |
| Người đọc | Dev mới vào dự án, reviewer, QA |
| Trạng thái | Draft |
| Last update | 2026-10-24 · Dev |

## TL;DR
- Mẫu nhà có thêm chế độ xem thứ hai, **"Ảnh thật"**. Người chụp đi một vòng trong nhà thật và chụp theo thứ tự. Người xem bấm **›** thì "bước" sang cảnh tiếp.
- Dùng được cho **nhà đã xây xong** mà không cần dựng 3D (nhà phố bán lại, căn hộ bàn giao, nhà mẫu thật). Một mẫu nhà có thể có cả 3D lẫn ảnh thật, hoặc chỉ một trong hai.
- Chuyển cảnh có hai loại: **mô phỏng** (trình duyệt phóng vào điểm đi tiếp rồi hiện cảnh sau, miễn phí, có ngay) và **clip** (đội dựng tạo bằng công cụ AI như Higgsfield/Kling rồi tải lên). Tự gọi API AI để Phase 2 (DEC-T4).
- Tour đi chung quy trình với 3D: lưu trong phiên bản, gửi duyệt, khách duyệt, rồi mới công khai.

## 0. Giải thích đơn giản

Giống dẫn khách đi xem nhà, nhưng qua ảnh. Người chụp đứng ở cổng chụp một tấm, bước tới cửa chính chụp tấm nữa, vào phòng khách chụp tiếp… Mỗi tấm nhìn theo hướng sẽ đi tiếp.

Đội dựng làm ba việc:
1. Kéo thả cả thư mục ảnh vào tab **"Ảnh thật"** của trình dựng. Hệ thống tự xếp theo số đầu tên tệp (`01-mat-tien.jpg`, `02-cong.jpg`…) và tự lấy tên cảnh có dấu ("Mặt tiền", "Cổng").
2. Trên mỗi ảnh, **bấm vào chỗ người chụp đã bước tới** để chụp ảnh sau (cửa, lối đi). Đó là "điểm đi tiếp".
3. Viết vài dòng mô tả, điểm nổi bật, liên kết với phòng trong mẫu 3D nếu có.

Người xem thấy ảnh toàn khung. Bấm › thì ảnh hiện tại phóng dần vào điểm đi tiếp và mờ đi, ảnh sau hiện lên như vừa bước vào. Bấm ‹ thì đi ngược lại.

### Ví dụ một vòng
1. Môi giới chụp 24 ảnh căn nhà phố trên đường Lê Lợi theo kịch bản (PDF tải từ tab "Ảnh thật"), đặt tên `01-…`–`24-…`, gửi qua Zalo.
2. Chị Hà kéo thả 24 ảnh vào. Hệ thống xử lý từng ảnh (xoay đúng chiều, thu về 2 cỡ, xoá thông tin vị trí GPS), xếp đúng 1–24.
3. Chị bấm điểm đi tiếp trên 23 ảnh. Ảnh cuối không cần. Với cặp "Cửa chính → Phòng khách", chị tạo clip 5 giây bằng Kling (dán 2 ảnh và câu lệnh mẫu), xem hết clip rồi tải lên, tick "Clip do AI tạo".
4. Bấm "Dùng ảnh cảnh 1 làm ảnh đại diện". Thanh kiểm hiện "✓ Đủ điều kiện". Quản trị viên gửi duyệt, khách duyệt, phát hành.
5. Người mua mở link: tour hiện ngay (mẫu nhà không có 3D nên không có tab 3D/Mặt bằng). Ở cảnh "Phòng khách", anh bấm "Để lại SĐT"; lead ghi "Đang xem: Ảnh thật · Phòng khách".

## 1. Vì sao cần
- Phần lớn nhà rao bán là nhà đã xây, chỉ có ảnh. Dựng 3D (0,5–3 ngày công) không đáng với một căn bán lại (P-T2).
- Thư viện ảnh rời không cho cảm giác đi trong nhà (P-T1). Tour 360° cần máy 360 và người biết chụp (P-T3).
- Mở thêm phân khúc khách hàng mà không cần đổi quy trình duyệt và phát hành.

| Làm | Không làm |
|---|---|
| Tải ảnh, xếp, điểm đi tiếp, clip, xem thử, kịch bản chụp + PDF, trình xem (Tiếp/Lùi/chấm/phím/vuốt/tự chạy/toàn màn hình), lead và thống kê theo cảnh, mẫu nhà chỉ có tour | Tự gọi AI tạo clip (Phase 2) · ảnh 360° · dựng 3D từ ảnh · tour rẽ nhánh · "cuộn để tua video" như demo tham chiếu |

## 2. Ai dùng, ở đâu
| Vai | Nơi | Khi nào |
|---|---|---|
| Người chụp (ngoài hệ thống) | PDF kịch bản chụp | Đi chụp nhà |
| Người dựng / QTV | Trình dựng → tab "Ảnh thật" (A7) | Nhận ảnh từ khách |
| Người duyệt | C3 — xem trước có tour | Duyệt như mẫu nhà 3D |
| Người mua | Link mẫu nhà → tab "Ảnh thật" (V6) | Xem nhà từ xa |

## 3. Tình huống thực tế
| # | Tình huống | Hệ thống làm gì | Vì sao |
|---|---|---|---|
| 1 | Tên tệp `IMG_4512.jpg` (không có số thứ tự) | Xếp theo giờ chụp trong ảnh, báo "kiểm lại thứ tự" | Người chụp quên đặt tên (EX-T2) |
| 2 | Ảnh HEIC từ iPhone | Ô chọn tệp khiến iPhone tự đổi sang JPG; nếu vẫn là HEIC thì báo "xuất JPG rồi tải lại" | Server không đọc được HEIC (DEC-T5) |
| 3 | Ảnh dọc hoặc nhỏ hơn 1.600 px | Vẫn nhận, cảnh báo bị cắt hoặc mờ khi xem toàn màn hình | EX-T1 |
| 4 | Đổi thứ tự sau khi đã gắn clip | Gỡ clip của các cặp bị đổi, báo số clip đã gỡ | Clip quay từ ảnh A sang B, sai cặp là sai cảnh (BR-T3) |
| 5 | Cảnh chưa có điểm đi tiếp | Chuyển cảnh dùng tâm ảnh; cảnh báo khi gửi duyệt (không chặn) | EX-T3 |
| 6 | Tour chỉ có 1 ảnh | Không gửi duyệt được: "Tour ảnh thật cần ít nhất 2 cảnh" | BR-T1 |
| 7 | Clip 30 giây hoặc 50 MB | Từ chối ngay khi chọn | EX-T4: trang xem tải nhanh |
| 8 | Máy bật "giảm chuyển động" | Bỏ phóng to, chỉ mờ dần 0,3 giây | NFR-T4 |
| 9 | Mạng chậm, ảnh sau chưa tải xong | Nút › hiện vòng quay, không nhảy sang khung trắng | EX-T6 |
| 10 | Thiết bị không có WebGL | Vẫn xem tour bình thường | Tour không cần 3D |

## 4. Quy tắc nghiệp vụ và lý do
| Quy tắc | Con số | Vì sao | ID |
|---|---|---|---|
| Tour 2–60 cảnh | ≥ 2 để gửi duyệt | Một ảnh không phải tour; 60 ảnh đủ cho biệt thự | FR-12.01, BR-T1 |
| Ảnh phục vụ 2 cỡ WebP | 2.560 px (màn lớn) và 1.280 px (điện thoại); nhận tối đa 25 MB/ảnh | Cảnh đầu hiện trong ≤ 3 giây trên 4G | NFR-T1 |
| Không lưu ảnh gốc, xoá EXIF/GPS | — | Ảnh gốc lộ vị trí nhà và thiết bị người chụp | BR-T5, NFR-T3 |
| Clip | MP4, ≤ 15 giây, ≤ 20 MB, chỉ phát khi đi tới | Tải nhanh; đi lùi dùng mô phỏng | FR-12.06 |
| Clip AI phải được xem hết và đánh dấu | Trang xem ghi "Chuyển cảnh minh hoạ do AI dựng" | AI có thể thêm đồ hoặc chi tiết không có thật → rủi ro quảng cáo sai | BR-T4 |
| Tầng rỗng không tính là 3D | Mẫu nhà chỉ có tour: không kiểm hiệu chỉnh, lối đi, điểm nhìn | Không bắt người dựng xoá tầng mặc định | DEC-T6 |
| Gửi duyệt khi có 3D **hoặc** tour | Không có cả hai → "Mẫu nhà chưa có tầng dựng hoặc tour ảnh thật" | Sửa FR-08.02 | CR-2 |

## 5. Điểm dễ hiểu nhầm
- **"Đây là 3D à?"** Không. Chỉ là ảnh phẳng với hiệu ứng phóng; cảm giác "bước" có được là nhờ ảnh chụp đúng kịch bản. Ảnh không theo quy tắc nối cảnh thì chuyển cảnh sẽ giật (R-T2).
- **"Demo trong video làm thế nào?"** Trang demo dùng 2 đoạn video dài do AI dựng từ ảnh tin đăng, cuộn trang để tua. Mình chọn nút Tiếp/Lùi theo yêu cầu (DEC-T2); clip AI gắn theo từng cặp cảnh.
- **"Ảnh tour công khai từ lúc tải lên?"** Không. Chỉ công khai sau khi phiên bản được phát hành, như ảnh đại diện và mô hình.
- **"Sửa tour sau khi phát hành?"** Tạo phiên bản mới, sửa, rồi gửi duyệt lại, như phần 3D.

## 6. Bản đồ nghiệp vụ → code
| Khái niệm | Code | Test |
|---|---|---|
| Dữ liệu tour, kiểm gửi duyệt, mẫu nhà chỉ có tour | `packages/core/src/schema.ts` (`TourSchema`), `rules.ts` (`hasModel3d`, `hasTour`, `submitChecks`) | `packages/core/test/core.test.ts` — "tour ảnh thật" |
| Xử lý ảnh (2 cỡ, xoá EXIF), kiểm tham chiếu | `apps/api/src/routes/projects.ts` (`/tour-images`, `validateRefs`), migration `002_tour_files.sql` | `apps/api/test/tour.test.ts` |
| Tour trong bản phát hành, lead theo cảnh, thống kê "top cảnh" | `services/snapshot.ts`, `leads.ts`, `stats.ts`, `public.ts` (`modes`) | `tour.test.ts` |
| Trình xem, hiệu ứng chuyển cảnh, clip | `apps/web/src/tour/TourPlayer.tsx`, `TourStage.tsx` | E2E-03 |
| Xếp ảnh, tên cảnh có dấu | `apps/web/src/tour/order.ts` | `apps/web/test/viewer.test.ts` — "tour ảnh thật" |
| Tab "Ảnh thật" trong trình dựng, kịch bản chụp | `app/studio/editor/TourTab.tsx`, `tour/guide.ts` | E2E-03 |

## 6b. CR-3 — Chế độ "Phim" (2026-10-25)

Câu lệnh mẫu user gửi yêu cầu trang "như một bộ phim kiến trúc": cuộn để đi liên tục, bắt đầu từ ngoài nhà, qua nội thất, kết bằng màn "lộ" sân sau và hồ bơi; có giá và thông số. Bổ sung:

| Phần | Người dùng thấy gì | Code |
|---|---|---|
| Chế độ **Phim** (mặc định) | Cuộn chuột hoặc vuốt dọc tới đâu thì "đi" tới đó: cuộn nửa chừng là đang đi nửa đường; phím ↓/Space sang cảnh sau. Thanh chương bên phải để nhảy | `apps/web/src/tour/TourFilm.tsx` |
| **Chương** | Mỗi cảnh thuộc Ngoài nhà / Bên trong / Sân vườn & hồ bơi; vào chương mới hiện màn tiêu đề chữ lớn. Khi nhập ảnh, hệ thống tự gợi ý chương theo tên cảnh; cảnh không gán chương thì theo cảnh trước (BR-T8) | `packages/core/src/rules.ts` (`sceneChapters`, `guessChapter`), A7 |
| **Màn mở đầu và màn lộ** | Mở đầu: tên căn, vị trí, giá, thông số. Kết: ảnh cuối lùi chậm, tên căn, thông số đầy đủ, điểm nổi bật, nút "Đặt lịch xem nhà · Để lại SĐT" | `TourFilm.tsx`, `TourFacts.tsx` |
| **Chất điện ảnh** | Ảnh trôi chậm khi đứng yên; ảnh dọc hiện đủ trên nền mờ của chính nó; nền tối, chữ lớn | `tour/frame.ts`, `tour.css` |
| **Giá & thông số** | Hộp "Thông tin & giá" trong trình dựng: giá (nhập theo tỷ), diện tích đất, tối đa 6 điểm nổi bật. Giá hiện kiểu "12,5 tỷ ₫"; để trống thì "Giá: liên hệ" (BR-T6). Giá nằm trong bản duyệt: sửa sau khi phát hành thì trang công khai giữ giá cũ tới khi phát hành bản mới (BR-T7) | `HouseInfo.tsx`, migration `003_house_facts.sql`, `snapshot.ts` |
| Thẻ mẫu nhà ở trang dự án | Có nhãn "3D" / "Ảnh thật" và giá | `ProjectPage.tsx` |

**Dữ liệu thử ảnh thật:** `data/data-test-tour-that/` gồm 13 ảnh Stahl House (Los Angeles) của Amelia Pergl, Wikimedia Commons, giấy phép CC BY 2.0. Ghi công trong `CREDITS.txt` và trong mô tả mẫu nhà thử. Chỉ dùng thử nội bộ (DEC-T9).

## 6c. CR-4 — Từ trong ra ngoài, ảnh nối nhau (2026-10-25)

- **Kịch bản đi từ trong ra ngoài** qua từng phòng: Bên trong → Sân vườn & hồ bơi → Ngoài nhà (quay lại nhìn toàn cảnh, cảnh kết là toàn cảnh đẹp nhất). Thứ tự chương nằm ở `TOUR_CHAPTERS` (`packages/core/src/schema.ts`); cảnh đầu mặc định Bên trong (`sceneChapters`). Kịch bản chụp trong `apps/web/src/tour/guide.ts` hướng dẫn đúng tuyến này.
- **Không tràn viền:** trước đây ảnh luôn phủ kín khung rồi còn phóng tới 2,3 lần khi chuyển cảnh, nên mất nhiều phần ảnh. Giờ chỉ phủ kín khi phải cắt ≤ 12% ảnh; còn lại hiện đủ ảnh trên nền mờ. Phóng tối đa 1,12 (`frame.ts` · `fitOf`, `walk`).
- **Ảnh nối nhau:** chuyển cảnh "bước" về điểm đi tiếp đã chấm trên ảnh trước, ảnh sau hiện ra từ đúng hướng đó, nhoè rồi rõ dần. Người xem thấy trước chỗ sẽ đi tới nhờ dấu chấm sáng + tên cảnh sau. Bấm dấu đó là đi. Vì vậy **chấm điểm đi tiếp đúng chỗ ảnh sau đứng chụp** quyết định cảm giác liền mạch; ảnh chụp không theo quy tắc nối cảnh (§11) thì hiệu ứng không bù được.

## 7. Giới hạn hiện tại
- Chưa tự gọi AI tạo clip (Phase 2, FR-12.14). Hiện đội dựng tạo clip ngoài hệ thống rồi tải lên.
- Chưa có tour rẽ nhánh (một tuyến thẳng).
- Thời lượng clip chỉ kiểm ở trình duyệt; server chỉ giới hạn dung lượng.
- Bộ ảnh mẫu `data/data-test-tour-demo/` được chụp từ cảnh 3D của biệt thự B2, chỉ để kiểm thử. Cần thử thêm với ảnh chụp thật.
