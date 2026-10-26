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
| G2 Thiết kế | ⬜ | | | |
| G3 Build | ⬜ | | | |
| G4 Kiểm thử | ⬜ | | | |
| G5 Release | ⬜ | | | |

## NOW
| Owner tiếp | Việc tiếp | Skill |
|---|---|---|
| Architect | Tech spec `02` (lát R1 trước) | ai-architect-write-spec |

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
| DEC-R4 | Điện thoại / Zalo | Tải dần: bản nhẹ trước (giữ NFR-01), bản đầy đủ tải sau | Trả lời làm rõ | khanhtt | 2026-10-26 |

## Lịch sử
| Ngày | Ai | Việc |
|---|---|---|
| 2026-10-26 | PO | SRS `01-srs.md` v0.1 (M13, FR-13.01–13.19, BR-R1–R8, NFR-R1–R6, AC-R1–R12, 5 lát R1–R5) |
| 2026-10-26 | Agent | Mở item 03 (lane feature, quy mô L), nhánh `feat/03-realistic-furniture` từ `dev`. User: "chèn đồ thật, thay vì mô hình vào từng thiết kế, cảm giác người dùng đang đi trong 1 ngôi nhà thật"; yêu cầu ghi SRS trước khi triển khai |
