# System map

> Bản đồ hệ thống đang chạy — nền cho reuse-first. Mỗi dòng có nguồn (file/lệnh).
> Ai làm thay đổi hệ thống thì cập nhật file này. Last update: 2026-10-24 · ai-flow-init
> ⚠️ Toàn bộ là **prototype** (dữ liệu tĩnh, không backend).

## Module / component
| Module | Trách nhiệm | Path | Chủ |
|---|---|---|---|
| Dữ liệu mẫu | 3 mẫu nhà, phòng, cửa, vị trí đồ | `src/data/houses.ts` | khanhtt |
| Catalog | 22 sản phẩm (giá, kích thước, biến thể màu) | `src/data/catalog.ts` | khanhtt |
| Kết cấu 3D | Sinh tường từ hình chữ nhật phòng, lỗ cửa/cửa sổ, cắt tường kiểu dollhouse, sàn texture canvas | `src/three/Structure.tsx` | khanhtt |
| Model nội thất | 21 model dựng bằng khối hình học (không file GLB) | `src/three/models.tsx` | khanhtt |
| Cảnh & camera | Ánh sáng ngày/đêm, camera toàn cảnh/phòng/đứng trong phòng | `src/three/HouseScene.tsx` | khanhtt |
| Chọn đồ | Hover, chọn, khung viền | `src/three/Furniture.tsx` | khanhtt |

## Data
| Thực thể | Nơi lưu | Field chính | Nguồn định nghĩa |
|---|---|---|---|
| House | hằng TS | id, name, type, area, rooms[], openings[] | `src/data/types.ts` |
| Room | hằng TS | rect [x,z,w,d], floor, placements[] | `src/data/types.ts` |
| Product / Variant | hằng TS | price, size, material, variants[] | `src/data/types.ts` |

## Interface / API
| Endpoint / event / command | Mục đích | Quyền | Nguồn |
|---|---|---|---|
| — | Chưa có API | | |

## Màn hình / bề mặt UI
| Route / màn | Mục đích | Component chính | Nguồn |
|---|---|---|---|
| `#/` | Danh sách mẫu nhà (mặt bằng SVG) | `HouseList` | `src/components/HouseList.tsx` |
| `#/house/:id` | Xem nhà 3D, chọn phòng, xem chi tiết đồ, đổi màu | `Viewer`, `HouseScene` | `src/components/Viewer.tsx` |

## Tích hợp ngoài
| Hệ thống | Mục đích | Cách gọi | Config |
|---|---|---|---|
| Google Fonts | Font Be Vietnam Pro | `<link>` | `index.html` |

## Thành phần dùng chung (reuse trước khi viết mới)
| Tên | Dùng cho | Path |
|---|---|---|
| `FloorPlan` | Mặt bằng 2D SVG từ cùng dữ liệu phòng | `src/components/FloorPlan.tsx` |
| `buildWalls` | Tường + lỗ cửa từ hình chữ nhật phòng | `src/three/Structure.tsx` |
| `FurnitureModel` | Model nội thất theo `ModelKey` | `src/three/models.tsx` |
