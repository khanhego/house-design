# 03-realistic-furniture — Status

| Trường | Giá trị |
|---|---|
| Tên | Đồ thật trong nhà 3D — thay khối hình học bằng mô hình đồ nội thất chân thực, cảm giác đi trong nhà thật |
| Loại | feature |
| Lane | feature |
| Quy mô | L |
| Component bị chạm | core (thư viện đồ, ngân sách dựng, kiểm gửi duyệt) · api (thư viện đồ, xử lý mô hình / vật liệu) · web (trình xem 3D, studio thư viện đồ, trình dựng) |
| Phụ thuộc | Item 01 (M04 thư viện đồ, M05 mô hình, M06 đặt đồ, trình xem 3D) · DEC-53 (đi bộ bằng bộ vật lý) |
| Nhánh | `feat/03-realistic-furniture` (từ `dev`) |
| Last update | 2026-10-26 · PO |

## Tiến độ
| Gate | Trạng thái | Ngày | Người duyệt | Ghi chú |
|:---:|:---:|---|---|---|
| G1 Yêu cầu | ✅ | 2026-10-26 | khanhtt | SRS v1.0 — "Code đi"; Q-R1…R4 chốt |
| G2 Thiết kế | ▶ R1, R2 | 2026-10-26 | agent | `02-tech-spec.md` lát R1 + R2 (R3–R5 viết khi tới) |
| G3 Build | ▶ R1, R2 | 2026-10-26 | | R1, R2 implement xong, chưa review subagent |
| G4 Kiểm thử | ⬜ | | | |
| G5 Release | ⬜ | | | |

## NOW
| Owner tiếp | Việc tiếp | Skill |
|---|---|---|
| Architect / Dev | Lát R3: kho 60 món chuẩn + 2 bộ đồ (Hiện đại, Tối giản), thay đồ từng món / hàng loạt, nâng 4 nhà mẫu demo | ai-architect-write-spec · ai-be-implement · ai-fe-implement |

## Decisions
| ID | Chủ đề | Quyết định | Lý do | Người | Ngày |
|---|---|---|---|---|---|
| DEC-R1 | "Đồ thật" là gì | Cả hai: kho đồ chuẩn chân thực (đội mình) làm mặc định + thay được bằng sản phẩm thật của khách | Trả lời làm rõ | khanhtt | 2026-10-26 |
| DEC-R2 | Phạm vi "cảm giác nhà thật" | Đồ + vật liệu (tường, sàn, trần, cửa) + ánh sáng; đồ trang trí nhỏ để sau | Trả lời làm rõ | khanhtt | 2026-10-26 |
| DEC-R3 | Nguồn đồ 3D | Kho miễn phí có giấy phép thương mại + AI tạo từ ảnh sản phẩm + file của khách; chưa mua trên chợ mô hình | Trả lời làm rõ | khanhtt | 2026-10-26 |
| DEC-R5 | Q-R1 AI tạo 3D | Chưa làm ở lát đầu; chọn dịch vụ (Hunyuan3D tự chạy / Meshy, Tripo trả phí) trước lát R5 | user chọn | khanhtt | 2026-10-26 |
| DEC-R6 | Q-R2 SketchUp | Không nhận `.skp`; khách xuất GLB/FBX/OBJ theo hướng dẫn | user chọn | khanhtt | 2026-10-26 |
| DEC-R7 | Q-R3 kho chuẩn | 60 món · 30 vật liệu · 2 bộ đồ (Hiện đại, Tối giản) | user chọn | khanhtt | 2026-10-26 |
| DEC-R8 | Q-R4 khách gửi file | Cổng tải lên cho khách (FR-13.19 nâng lên M, lát R4) | user chọn | khanhtt | 2026-10-26 |
| DEC-R9 | Ảnh vân chuẩn | Tải sẵn ảnh CC0 Poly Haven vào repo (2,9 MB, `scripts/fetch-materials.ts`) thay vì tải lúc seed: CI, demo tĩnh chạy không cần mạng; gạch men ốp WC sinh bằng code (kho không có gạch men sạch) | | Agent | 2026-10-26 |
| DEC-R10 | Mô hình dữ liệu vật liệu | Bảng `materials` riêng (migration 004), id lưu trong `Room.finish` / `HouseDocument.finishes`; không gán thì giữ hiển thị cũ, không phải chuyển đổi tài liệu cũ | | Agent | 2026-10-26 |
| DEC-R11 | Ánh sáng | RoomEnvironment (không tải HDRI) + Sky + mặt trời theo `northDeg`/`hour` (vĩ độ 16°B, xuân phân) | Nhẹ cho điện thoại | Agent | 2026-10-26 |
| DEC-R12 | Tải dần | Ảnh 256 cho mọi vật liệu đang dùng ngay khi mở; chất lượng Đẹp tải tiếp 1024 cho mọi vật liệu đang dùng (không giới hạn theo tầng như spec: một nhà ≈ 10–15 vật liệu, tổng ≈ 3–5 MB) | Đơn giản, đủ NFR-R1 | Agent | 2026-10-26 |
| DEC-R13 | UI | Gộp tab Vật liệu và Ánh sáng thành một tab trình dựng: Vật liệu & ánh sáng | Ít chuyển tab | Agent | 2026-10-26 |
| DEC-R14 | Chuyển FBX/OBJ | assimpjs (assimp WASM, MIT) trong worker; ảnh texture tìm theo tên trong tệp kèm, thiếu → ảnh trắng + cảnh báo; ảnh EXR/TGA bỏ + cảnh báo | Không cần cài chương trình riêng trên máy chủ / CI (FBX2glTF theo hệ điều hành, obj2gltf chỉ OBJ) | Agent | 2026-10-26 |
| DEC-R15 | Tự nhận đơn vị, trục | So hộp bao với kích thước khai báo (thiếu khai báo: cạnh lớn nhất 0,05–8 m, giữ trục Y); chọn tay + Xử lý lại | assimp không tự xoay file Z-up | Agent | 2026-10-26 |
| DEC-R16 | Ảnh xem trước 3D | Chụp trong studio từ khung xem (canvas → ảnh đại diện), không render trên máy chủ | Máy chủ không có GPU | Agent | 2026-10-26 |
| DEC-R17 | Ngân sách bản máy tính | `BUDGET_DESKTOP` cảnh báo 1,5 triệu tam giác / 250 draw call / 384 MB texture / 30 MB; chặn 3 triệu / 400 / 768 MB / 45 MB. `BUDGET` cũ áp cho bản điện thoại (đồ tính bản nhẹ) | BR-07 mở rộng, NFR-R1 (bản đầy đủ ≤ 30 MB) | Agent | 2026-10-26 |
| DEC-R18 | Đồ có sẵn | Migration 005 chuyển 22 khối dựng có sẵn sang Sẵn dùng · Đội tự làm · CC0 | Mẫu nhà đang có không bị chặn gửi duyệt | Agent | 2026-10-26 |
| DEC-R19 | Lệch kích thước | Kích thước khai báo là chuẩn; trình xem co giãn từng trục mô hình đã chuẩn hoá; > 20% phải chọn (lưu `size_accepted`, đổi mô hình thì bỏ chọn) | BR-R4; lối đi và va chạm tính theo khai báo | Agent | 2026-10-26 |
| DEC-R4 | Điện thoại / Zalo | Tải dần: bản nhẹ trước (giữ NFR-01), bản đầy đủ tải sau | Trả lời làm rõ | khanhtt | 2026-10-26 |

## Lịch sử
| Ngày | Ai | Việc |
|---|---|---|
| 2026-10-26 | Agent | Lát R2 implement: migration 005 (sao lưu `data/app.db.bak-truoc-migration-005`), nhập GLB/glTF/FBX/OBJ/ZIP, chuẩn hoá đơn vị + trục + gốc, bản đầy đủ + bản nhẹ, mức món, nguồn & giấy phép, phạm vi khách, QTV duyệt, `ITEM_NOT_READY` / `ITEM_OTHER_CLIENT`, ngân sách hai bản, tải dần khối → nhẹ → đầy đủ, chi tiết đồ + trang Nguồn đồ & vật liệu, studio Thư viện đồ (xem 3D, chụp ảnh đại diện); thử thật sofa Poly Haven (glTF 0,7 s, FBX 1,6 s); core 40 · api 106 · web 42 · E2E 4/4 |
| 2026-10-26 | Agent | Lát R1 implement: migration 004 (sao lưu `data/app.db.bak-truoc-migration-004`), API-M1…M5, 30 vật liệu chuẩn, vật liệu sàn/tường/trần/cửa/bậc thang, nắng + bầu trời + phản chiếu, chất lượng Tự động/Nhẹ/Đẹp, tab trình dựng, trang Vật liệu; core 36 · api 94 · web 38 · E2E 4/4 |
| 2026-10-26 | PO | SRS `01-srs.md` v0.1 (M13, FR-13.01–13.19, BR-R1–R8, NFR-R1–R6, AC-R1–R12, 5 lát R1–R5) |
| 2026-10-26 | Agent | Mở item 03 (lane feature, quy mô L), nhánh `feat/03-realistic-furniture` từ `dev`. User: "chèn đồ thật, thay vì mô hình vào từng thiết kế, cảm giác người dùng đang đi trong 1 ngôi nhà thật"; yêu cầu ghi SRS trước khi triển khai |
