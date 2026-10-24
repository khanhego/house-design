# SRS item 02 — Tham quan ảnh thật (Photo Tour)

| | |
|---|---|
| Item | `02-real-photo-tour` · lane feature · quy mô S |
| Phiên bản | 1.0 — Approved (G1 ✅ 2026-10-24 · khanhtt) · Q-1 = A + C (Phase 1), B ở Phase 2 |
| Liên quan SRS hệ thống | CR-2 (`docs/ai/system/SRS.md` v0.4): thêm module **M12**, màn **V6**, **A7**; sửa FR-08.02 |
| Nguồn | Yêu cầu user 2026-10-24 · video tham chiếu "NEW Era of 3D Websites is here!" (Marcin AI, youtu.be/lGFJ-jt4hhU) · demo `laquillaestate.lovable.app` (khảo sát 2026-10-24) · ảnh "prompt mẫu" user nhắc tới **chưa nhận được** (Q-5) |
| Owner | khanhtt |
| Last update | 2026-10-24 · PO |

> **TL;DR**
> - Thêm chế độ xem thứ hai cho mẫu nhà: **"Ảnh thật"**. Người chụp đi một vòng trong nhà thật, chụp theo thứ tự đường đi. Đội dựng tải ảnh lên theo thứ tự. Người xem bấm **Tiếp** thì camera "đi" tới cảnh kế tiếp.
> - Dùng được cho **nhà đã xây xong** (nhà phố bán lại, căn hộ bàn giao, biệt thự hoàn thiện, nhà mẫu thật) mà không cần dựng 3D. Đây là loại hàng chiếm phần lớn tin đăng của sàn và môi giới.
> - Trang demo trong video **không phải 3D**: đó là video bay camera do AI tạo (Higgsfield) từ ảnh tin đăng, tua theo thao tác cuộn. Item này lấy ý tưởng đó, nhưng bước tới cảnh kế tiếp bằng nút **Tiếp**.
> - **Cần chốt (Q-1):** chuyển cảnh bằng (A) mô phỏng trên trình duyệt (miễn phí, có ngay), (B) video AI tạo tự động (giống demo, tốn phí mỗi đoạn, cần chọn nhà cung cấp), hoặc (C) đội dựng tự tạo clip bằng công cụ AI rồi tải lên. **Đề xuất: A + C trước, B sau.**

---

## 1. Phạm vi

| Trong | Ngoài |
|---|---|
| Tải ảnh theo thứ tự, sắp xếp lại, đặt tên/mô tả cảnh · điểm "đi tiếp" trên ảnh · chuyển cảnh mô phỏng · gắn clip chuyển cảnh tải lên · trình xem Tiếp/Lùi/vuốt/phím/tự chạy · thẻ thông tin theo cảnh · liên kết cảnh ↔ phòng/tầng của mẫu nhà (nếu có 3D) · lead/thống kê theo cảnh · duyệt & phát hành như nội dung mẫu nhà · kịch bản chụp cho người dùng | Ảnh 360°/panorama (Phase sau) · tạo mô hình 3D từ ảnh (Gaussian splatting, photogrammetry) · tự động gọi API AI tạo video (chờ Q-1) · chỉnh màu/khử nhiễu ảnh · nhiều nhánh đường đi (rẽ trái/phải) — P1 chỉ một tuyến thẳng |

**Thuật ngữ**

| Từ | Nghĩa |
|---|---|
| Tour ảnh | Chuỗi cảnh có thứ tự của một mẫu nhà |
| Cảnh | Một ảnh chụp + tên + mô tả + điểm đi tiếp + (tuỳ chọn) phòng liên kết |
| Điểm đi tiếp | Vị trí trên ảnh mà người chụp đã bước tới để chụp cảnh sau (cửa, lối đi). Chuyển cảnh mô phỏng "lao" vào điểm này |
| Chuyển cảnh | Hiệu ứng từ cảnh *n* sang *n+1*: **mô phỏng** (trình duyệt tự làm) hoặc **clip** (video ngắn tải lên) |

## 2. Bài toán

**AS-IS.** Hiện nền tảng chỉ bán được cho mẫu nhà **có thiết kế**, vì phải dựng khung và 3D. Với nhà đã xây xong (bán lại, bàn giao, nhà mẫu thật), bên bán chỉ có bộ ảnh chụp đăng thành thư viện ảnh rời rạc. Người xem không biết ảnh nào nối với ảnh nào, phòng nào cạnh phòng nào.

| # | Vấn đề | Hệ quả |
|---|---|---|
| P-T1 | Thư viện ảnh rời rạc không cho cảm giác đi trong nhà | Người mua phải đến tận nơi mới hình dung được bố cục |
| P-T2 | Dựng 3D tốn 0,5–3 ngày công mỗi mẫu; không đáng với nhà bán lại một căn | Nền tảng bỏ lỡ phân khúc môi giới / sàn thứ cấp |
| P-T3 | Tour 360° cần máy ảnh 360 và người biết chụp | Bên bán nhỏ không làm được |

**Mục tiêu**

| Chỉ số | Mục tiêu |
|---|---|
| Thời gian đội dựng làm một tour 25 ảnh (đã có ảnh) | ≤ 30 phút |
| Chụp được bằng điện thoại thường, theo kịch bản §11 | 100% |
| Chuyển cảnh mô phỏng bắt đầu trong ≤ 150 ms sau khi bấm Tiếp (ảnh kế đã tải trước) | trên máy tham chiếu NFR-01 |

## 3. Tác nhân

Như SRS hệ thống. Thêm vai trò ngoài hệ thống: **người chụp** (nhân viên bên bán, môi giới, thợ ảnh) — chỉ làm theo kịch bản §11, không dùng hệ thống.

## 4. Quy trình TO-BE

| Bước | Ai | Làm gì | Hệ thống |
|---|---|---|---|
| B1 | Người chụp | Chụp theo kịch bản §11, đặt tên tệp `01-…`, `02-…` | — |
| B2 | Người dựng | A7 → kéo thả cả thư mục ảnh | Sắp theo số đầu tên tệp; tạo một cảnh mỗi ảnh; tên cảnh lấy từ tên tệp (bỏ số, gạch ngang → khoảng trắng) |
| B3 | Người dựng | Kiểm thứ tự (kéo để đổi), sửa tên/mô tả, **chấm điểm đi tiếp** trên mỗi ảnh (trừ ảnh cuối), gắn phòng/tầng nếu mẫu nhà có 3D | Xem trước chuyển cảnh ngay trong A7 |
| B4 | Người dựng | (Tuỳ chọn) tải clip chuyển cảnh cho cặp cảnh quan trọng | Kiểm định dạng, thời lượng |
| B5 | QTV | Gửi duyệt như mẫu nhà (M08) | Tour nằm trong snapshot; người duyệt xem trước ở C3 |
| B6 | Người xem | V2 → tab **Ảnh thật** (hoặc mở thẳng nếu mẫu nhà chỉ có tour) → Tiếp / Lùi / vuốt / tự chạy | Ghi sự kiện cảnh; lead kèm cảnh đang xem |

**Ngoại lệ**

| ID | Tình huống | Xử lý |
|---|---|---|
| EX-T1 | Ảnh dọc / quá nhỏ (< 1.600 px cạnh dài) | Nhận nhưng cảnh báo "Ảnh dọc/nhỏ sẽ bị cắt hoặc mờ khi xem toàn màn hình" |
| EX-T2 | Tên tệp không có số thứ tự | Xếp theo thời điểm chụp (EXIF), không có thì theo thứ tự chọn; báo để người dựng kiểm |
| EX-T3 | Cảnh (trừ cảnh cuối) chưa có điểm đi tiếp | Chuyển cảnh mô phỏng dùng tâm ảnh; cảnh báo khi gửi duyệt (không chặn) |
| EX-T4 | Clip lỗi định dạng / > 15 s / > 20 MB | Từ chối, nêu lý do |
| EX-T5 | Thiết bị yếu / bật "giảm chuyển động" | Bỏ hiệu ứng, chuyển cảnh mờ dần 300 ms |
| EX-T6 | Mạng chậm, ảnh kế chưa tải xong | Nút Tiếp hiện vòng tải; không nhảy sang ảnh trắng |

## 5. Yêu cầu chức năng — M12 Tham quan ảnh thật

| ID | Yêu cầu | Ưu tiên | Phase | Nguồn |
|---|---|:---:|:---:|---|
| FR-12.01 | Hệ thống phải cho mỗi mẫu nhà có **tối đa một tour ảnh** gồm 2–60 cảnh có thứ tự | M | 1 | P-T1 |
| FR-12.02 | Hệ thống phải cho tải nhiều ảnh một lần (kéo thả, JPG/PNG/WebP/HEIC, ≤ 15 MB/ảnh), tự xếp theo số đầu tên tệp (EX-T2) | M | 1 | B2 |
| FR-12.03 | Hệ thống phải cho đổi thứ tự bằng kéo thả, xoá cảnh, thay ảnh của cảnh | M | 1 | B3 |
| FR-12.04 | Mỗi cảnh phải có: tên (bắt buộc, ≤ 80 ký tự), mô tả (≤ 300), điểm đi tiếp (toạ độ tương đối trên ảnh), phòng/tầng liên kết (tuỳ chọn), tối đa 3 dòng thông tin nổi bật | M | 1 | B3 |
| FR-12.05 | Hệ thống phải chuyển cảnh **mô phỏng**: phóng dần vào điểm đi tiếp của cảnh *n* đồng thời mờ dần sang cảnh *n+1* đang thu từ gần ra, tổng ≤ 1,2 s; ngược lại khi Lùi | M | 1 | P-T1 |
| FR-12.06 | Hệ thống phải cho gắn **clip chuyển cảnh** (MP4 H.264, ≤ 15 s, ≤ 20 MB) cho từng cặp cảnh; có clip thì phát clip thay cho mô phỏng, khung cuối clip khớp ảnh cảnh sau | S | 1 | Q-1 (C) |
| FR-12.07 | Trình xem phải có: Tiếp, Lùi, chấm tiến độ (bấm để nhảy), phím ←/→, vuốt trái/phải, **Tự chạy** (dừng ở mỗi cảnh 4 s, dừng khi người xem chạm), toàn màn hình | M | 1 | B6 |
| FR-12.08 | Trình xem phải hiện tên cảnh, mô tả, thông tin nổi bật dạng thẻ; nếu cảnh liên kết phòng của mẫu nhà 3D thì có nút "Xem phòng này 3D" và "Mặt bằng" | M | 1 | B6 |
| FR-12.09 | Trình xem phải tải trước ảnh của 2 cảnh kế tiếp và 1 cảnh trước; ảnh phục vụ theo bản tối ưu (cạnh dài 2.560 px WebP, kèm bản 1.280 px cho điện thoại) | M | 1 | NFR-T1 |
| FR-12.10 | Mẫu nhà **chỉ có tour** (không có tầng) phải phát hành được; V1 hiện nhãn "Ảnh thật"; V2 mở thẳng tour, ẩn tab 3D/Mặt bằng | M | 1 | P-T2 |
| FR-12.11 | Lead gửi từ tour phải kèm cảnh đang xem; thống kê thêm sự kiện mở tour, xem cảnh, hoàn thành tour; báo cáo có "top cảnh" | S | 1 | M10, M11 |
| FR-12.12 | Trong A7, người dựng phải xem trước được chuyển cảnh của từng cặp | M | 1 | B3 |
| FR-12.13 | Hệ thống phải hiện **kịch bản chụp** (§11) trong A7 và cho tải PDF để gửi người chụp | S | 1 | B1 |
| FR-12.14 | Hệ thống phải tự gọi dịch vụ AI tạo clip chuyển cảnh từ 2 ảnh (khung đầu – khung cuối), xếp hàng chờ, cho người dựng duyệt từng clip trước khi dùng | C | 2 | Q-1 (B) |
| FR-12.15 | Tour nhiều nhánh (tại một cảnh chọn đi tiếp tới 2–3 cảnh khác) | W | — | Phase sau |

**Sửa FR hiện có**

| ID | Thay đổi |
|---|---|
| FR-08.02 | Điều kiện gửi duyệt: mẫu nhà phải có **ít nhất một** trong: ≥ 1 tầng hợp lệ, hoặc tour ≥ 2 cảnh. Kiểm khung/tầng chỉ áp dụng khi có tầng; kiểm tour (BR-T1) khi có tour |
| FR-06.01 | Thẻ mẫu nhà ở V1 có nhãn chế độ: "3D", "Ảnh thật", hoặc cả hai |

**Quyền:** như M03/M04: QTV và Người dựng sửa tour; Người duyệt chỉ xem trước; người xem chỉ xem bản đã phát hành.

## 6. Use case

**UC-12 — Làm tour ảnh thật cho một căn nhà đã xây**
- Tiền điều kiện: mẫu nhà ở trạng thái Đang dựng; có ảnh chụp theo §11.
- Luồng chính: B2 → B3 → (B4) → xem trước toàn tour → gửi duyệt.
- Hậu điều kiện: tour nằm trong phiên bản; sau khi phát hành, link mẫu nhà mở được tour.
- Ngoại lệ: EX-T1…T4.

**UC-13 — Người xem tham quan nhà bằng ảnh thật**
- Luồng chính: mở link → tour hiện cảnh 1 → bấm Tiếp liên tục (hoặc Tự chạy) → ở cảnh quan tâm bấm "Để lại SĐT" → lead kèm tên cảnh.
- Ngoại lệ: EX-T5, EX-T6.

## 7. Quy tắc nghiệp vụ

| ID | Quy tắc | Ví dụ |
|---|---|---|
| BR-T1 | Gửi duyệt tour: ≥ 2 cảnh; mọi cảnh có tên. **Cảnh báo** (không chặn): cảnh thiếu điểm đi tiếp, ảnh dọc/nhỏ | Tour 1 cảnh → chặn "Tour cần ít nhất 2 cảnh" |
| BR-T2 | Thứ tự cảnh là thứ tự đi; Lùi đi ngược đúng thứ tự | Cảnh 5 → Lùi → cảnh 4 (chuyển cảnh mô phỏng ngược) |
| BR-T3 | Clip chuyển cảnh chỉ dùng cho đúng cặp (n → n+1); đổi thứ tự làm cặp đổi thì **gỡ clip** của các cặp bị ảnh hưởng và báo người dựng | Kéo cảnh 3 lên trước cảnh 2 → gỡ clip 1→2, 2→3, 3→4 |
| BR-T4 | Clip do AI tạo phải được người dựng xem hết trước khi gắn; phát hành kèm dòng "Chuyển cảnh minh hoạ do AI dựng" khi tour có clip AI | Tránh quảng cáo sai hiện trạng (nội thất, kết cấu "bịa") |
| BR-T5 | Ảnh gốc người chụp tải lên **không công khai**; chỉ bản tối ưu (đã xoá EXIF/GPS) được phục vụ | Bảo vệ vị trí nhà, thiết bị người chụp |

## 8. Phi chức năng

| ID | Yêu cầu | Cách kiểm |
|---|---|---|
| NFR-T1 | Cảnh đầu hiện trong ≤ 3 s trên 4G (ảnh 1.280 px ≤ 300 KB) | Đo như NFR-02 |
| NFR-T2 | Chuyển cảnh mô phỏng ≥ 50 khung hình/s trên máy tham chiếu; chỉ dùng transform/opacity (GPU) | Performance panel |
| NFR-T3 | Xoá EXIF/GPS ở mọi ảnh phục vụ | Kiểm tệp tải về |
| NFR-T4 | Trình xem dùng được hoàn toàn bằng bàn phím; nút có nhãn; tôn trọng `prefers-reduced-motion` | a11y |

## 9. Dữ liệu nghiệp vụ

| Thực thể | Trường chính |
|---|---|
| Tour (thuộc phiên bản mẫu nhà) | danh sách cảnh có thứ tự, chế độ tự chạy (giây/cảnh) |
| Cảnh | ảnh (tệp loại *ảnh tour*), tên, mô tả, thông tin nổi bật (≤ 3), điểm đi tiếp (x, y ∈ 0–1), tầng/phòng liên kết, clip tới cảnh sau (tệp loại *clip tour*, nguồn: tải lên / AI) |
| Sự kiện thống kê mới | `tour_open`, `tour_scene` (cảnh), `tour_complete` |

## 10. Màn hình

| Kênh | Màn | Mục đích | FR |
|---|---|---|---|
| Web công khai | **V6** Tour ảnh thật (tab "Ảnh thật" trong V2, hoặc toàn trang khi mẫu nhà chỉ có tour) | Xem tour | 12.05–12.11 |
| Nội bộ | **A7** Tour ảnh (tab mới trong A3: "Ảnh thật") | Tải ảnh, sắp thứ tự, điểm đi tiếp, clip, xem trước, kịch bản chụp | 12.01–12.06, 12.12, 12.13 |

**V6 — phác thảo**
```
┌──────────────────────────────────────────────────────────────┐
│ ← Mẫu khác  [logo] Nhà phố Lê Lợi 4×18      [3D|Ảnh thật|MB] │
│                                                              │
│                 (ảnh toàn khung, cảnh 4/22)                  │
│  ┌───────────────────────┐                                   │
│  │ PHÒNG KHÁCH           │                         ( › )     │
│  │ Trần 3,6 m, cửa kính  │   ( ‹ )                           │
│  │ [Xem phòng này 3D]    │                                   │
│  └───────────────────────┘                                   │
│  ● ● ● ◉ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○   ▶ Tự chạy  ⤢  │
│                                        [ Liên hệ tư vấn ]    │
└──────────────────────────────────────────────────────────────┘
```
Trạng thái: đang tải (ảnh mờ + vòng tải) · ảnh kế chưa tải (nút Tiếp quay) · cảnh cuối ("Bạn đã xem hết · Xem lại từ đầu · Để lại SĐT") · không có tour (ẩn tab).

**A7 — phác thảo**
```
┌ Khung | Mô hình | Đồ | Điểm nhìn | Ảnh thật ────────────────────┐
│ [Kéo thả ảnh vào đây · Chọn tệp]  [Kịch bản chụp ▾] [Xem thử ▶] │
│ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐  ← dải ảnh, kéo để đổi thứ tự         │
│ │01││02││03││04││05││06│   ⚠ cảnh 3 chưa có điểm đi tiếp       │
│ └──┘└──┘└──┘└──┘└──┘└──┘                                       │
│ ┌──────────── ảnh cảnh đang chọn ─────────────┐ Tên  [Phòng khách]│
│ │          ✚ ← bấm để đặt điểm đi tiếp       │ Mô tả [........]  │
│ └─────────────────────────────────────────────┘ Phòng [Tầng 1·PK▾]│
│  [Xem thử chuyển cảnh 3 → 4]  Clip 3→4: [Tải clip] (mô phỏng)    │
└───────────────────────────────────────────────────────────────────┘
```

## 11. Kịch bản chụp & nhập (giao cho người chụp — FR-12.13)

**Thiết bị:** điện thoại đời 2020 trở về sau hoặc máy ảnh. Chụp **ngang**, ống kính chính (1×). Ống siêu rộng 0,5× chỉ dùng cho phòng nhỏ hơn 8 m². Bật HDR. Nên dùng gậy hoặc chân máy.

**Chuẩn bị nhà:** bật hết đèn, kéo rèm, dọn đồ cá nhân, đóng nắp bồn cầu, tắt TV. Không để người hoặc thú cưng trong khung hình. Chụp cùng một buổi (10–15 h hoặc 15–17 h) để ánh sáng các ảnh đồng đều.

**Quy tắc đặt máy:**
1. Cầm máy ở **tầm mắt, 1,5 m**, giữ thẳng đứng (đường dọc của tường phải thẳng), không ngửa, không cúi.
2. Mỗi ảnh **nhìn theo hướng sẽ đi tiếp**, như đang bước vào nhà.
3. **Quy tắc nối cảnh:** chỗ đứng chụp ảnh sau phải **nhìn thấy được trong ảnh trước**, cách 2–4 m. Không quay quá 90° giữa hai ảnh liền nhau. Muốn đổi hướng mạnh thì chụp thêm một ảnh trung gian.
4. **Qua cửa:** chụp 1 ảnh đứng **trước cửa nhìn vào**, rồi 1 ảnh **đứng trong phòng, cách cửa khoảng 1 m**, nhìn vào giữa phòng.
5. **Cầu thang:** 1 ảnh chân thang nhìn lên, 1 ảnh giữa thang, 1 ảnh đầu thang nhìn ra sảnh tầng.

**Tuyến đi gợi ý:** mặt tiền (đứng bên kia đường) → cổng/sân → cửa chính → sảnh → phòng khách → bếp/ăn → WC tầng 1 → cầu thang → sảnh tầng 2 → phòng ngủ (mỗi phòng 2 ảnh: từ cửa, và từ góc đối diện nhìn ra cửa sổ) → WC → … → sân thượng / ban công → cảnh kết (nhìn ra view đẹp nhất).

**Số lượng:** căn hộ 12–25 ảnh · nhà phố 20–40 · biệt thự 30–60.

**Đặt tên tệp:** `01-mat-tien.jpg`, `02-cong.jpg`, `03-cua-chinh.jpg`… Số đầu là thứ tự đi, phần sau là tên cảnh (hệ thống tự lấy làm tên).

**Không chụp:** gương đối diện máy (lộ người chụp), giấy tờ hoặc ảnh gia đình, biển số xe, ảnh dọc.

**Mẫu câu lệnh cho công cụ AI tạo clip** (phương án C, dán cùng 2 ảnh: ảnh đầu = cảnh *n*, ảnh cuối = cảnh *n+1*):
> Smooth cinematic forward camera move at eye level (1.5 m), steadicam, from the first frame to the last frame, walking naturally through the space toward the doorway. Keep every wall, window, furniture item and material exactly as in the two frames; do not add or remove objects; no people; natural daylight; 5 seconds; 16:9.

## 12. Giả định · rủi ro · câu hỏi mở

| ID | Nội dung | Loại | Chặn G1? |
|---|---|---|:---:|
| Q-1 | ~~Công nghệ chuyển cảnh~~ → **Đã chốt: A + C ở Phase 1, B ở Phase 2** (user 2026-10-24) | Đã đóng | — |
| Q-2 | Mẫu nhà chỉ có tour (không có 3D) có bán như gói riêng, giá thấp hơn? Ảnh hưởng tên sản phẩm "Nhà mẫu online có bản vẽ" | Câu hỏi kinh doanh | ✘ (mặc định: cho phép, giá do kinh doanh quyết) |
| Q-3 | Có cần chế độ "cuộn để đi" như demo (cuộn trang tua video), ngoài nút Tiếp? | Câu hỏi | ✘ (mặc định: không, có thể thêm sau) |
| Q-4 | HEIC (ảnh iPhone) cần chuyển sang JPG ở server; nếu chưa làm kịp thì yêu cầu người chụp xuất JPG | Giả định | ✘ |
| Q-5 | Ảnh "prompt mẫu" user nhắc tới chưa nhận được — cần để đối chiếu phong cách giao diện / câu lệnh AI | Chờ user | ✘ |
| R-T1 | Clip AI "bịa" chi tiết không có thật → rủi ro quảng cáo sai (BR-T4, dòng miễn trừ, người duyệt xem trước) | Rủi ro | |
| R-T2 | Ảnh chụp không theo quy tắc nối cảnh → chuyển cảnh mô phỏng giật, cảm giác "nhảy" | Rủi ro — giảm bằng kịch bản §11 và xem thử ở A7 | |
| R-T3 | Ảnh gốc 5–15 MB × 60 → dung lượng lưu trữ; cần tối ưu và giới hạn | Rủi ro | |

## 13. Nghiệm thu

| ID | Tiêu chí | Cách kiểm |
|---|---|---|
| AC-T1 | Kéo thả 20 ảnh tên `01-…`–`20-…` theo thứ tự lộn xộn → tour đúng thứ tự 1–20, tên cảnh lấy từ tên tệp | Thử với bộ ảnh mẫu |
| AC-T2 | Bấm Tiếp 19 lần đi hết tour, mỗi lần chuyển cảnh ≤ 1,2 s, không khung trắng; Lùi đi ngược đúng | Thao tác trên máy tham chiếu |
| AC-T3 | Cặp có clip phát clip, khung cuối khớp ảnh cảnh sau; cặp không có clip dùng mô phỏng | Gắn clip cho 1 cặp |
| AC-T4 | Mẫu nhà chỉ có tour gửi duyệt → duyệt → phát hành được; V1 có nhãn "Ảnh thật"; tour 1 cảnh bị chặn với thông báo BR-T1 | Đi trọn luồng |
| AC-T5 | Lead gửi ở cảnh 7 có tên cảnh 7 trong danh sách lead và email | Gửi thử |
| AC-T6 | Ảnh tải về từ trang công khai không còn EXIF/GPS | `exiftool` |
| AC-T7 | Điện thoại: vuốt trái/phải chuyển cảnh; bật "giảm chuyển động" → mờ dần thay vì phóng | iOS + Android |

## Chốt G1
- [x] Bài toán trước giải pháp (§2)
- [x] FR kiểm được, có ưu tiên, nguồn (§5)
- [x] Ngoại lệ, quy tắc có ví dụ (§4, §7)
- [x] NFR có con số (§8)
- [x] Màn hình có phác thảo + trạng thái (§10)
- [x] Kịch bản chụp cho người dùng (§11)
- [x] Q-1 công nghệ chuyển cảnh: **A (mô phỏng) + C (clip tải lên)** ở Phase 1; B (API AI) ở Phase 2 — user chốt 2026-10-24
