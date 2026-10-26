# Nhà mẫu online

Dịch vụ + nền tảng biến tin đăng bán nhà thành **nhà mẫu 3D đi lại được**, mặt bằng có kích thước, tour ảnh thật,
kèm form để lại số điện thoại và thống kê lượt xem cho bên bán.

**Demo:** https://khanhego.github.io/house-design/v/sunrise-garden

Bản demo trên GitHub Pages là bản tĩnh của trang xem nhà: 4 nhà mẫu (căn hộ, nhà phố 4 tầng, biệt thự 3 tầng,
nhà vườn) dựng từ dữ liệu mẫu. Studio dựng nhà, cổng khách duyệt và form để lại SĐT cần máy chủ nên không có trong
bản demo.

Trong 3D, bấm **Đứng trong phòng** để đi bộ trong nhà:

- **W / S** hoặc **↑ / ↓**: đi tới, lùi. **A / D** hoặc **← / →**: xoay. Giữ **Shift** để chạy.
- Bấm vào sàn, kể cả phòng ở tầng khác: người mẫu tự tìm đường đi tới.
- Đi tới cầu thang và cứ giữ W là lên tầng (cầu thang chữ U, có chiếu nghỉ).

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `packages/core` | Dữ liệu nhà, quy tắc nghiệp vụ, kiểm lối đi, hình học cầu thang và khung va chạm đi bộ |
| `apps/api` | Fastify 5 + SQLite (`node:sqlite`), ảnh (sharp), duyệt / phát hành, lead, thống kê |
| `apps/web` | React 19 + three.js (react-three-fiber); đi bộ bằng Rapier + navmesh Recast |
| `docs/` | SRS, spec, tài liệu nghiệp vụ |

## Chạy trên máy

Cần Node 25 (chạy TypeScript trực tiếp, `node:sqlite`).

```bash
npm ci
npm run build
node apps/api/src/seed/seed.ts          # dữ liệu nhà mẫu (lần đầu)
NODE_ENV=development WEB_DIST=apps/web/dist node apps/api/src/main.ts
# mở http://localhost:8787/v/sunrise-garden
```

Kiểm tra: `npm run lint`, `npm test`, `npx playwright test`.

## Nguồn tài nguyên

Ảnh vân vật liệu chuẩn: [Poly Haven](https://polyhaven.com) (CC0), Powered by Poly Haven.

## CI/CD

`.github/workflows/ci-cd.yml`: mỗi lần đẩy lên `main` hoặc `dev`, chạy lint, unit (gồm mô phỏng đi bộ trên 4 nhà mẫu)
và E2E; đạt thì dựng bản demo tĩnh (`VITE_STATIC=1`, `scripts/export-static.ts`) và đưa lên GitHub Pages.
