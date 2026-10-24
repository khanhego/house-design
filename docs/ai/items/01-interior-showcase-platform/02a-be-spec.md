# BE Spec — Nhà mẫu online có bản vẽ · Phase 1 · `apps/api` + `packages/core`

| | |
|---|---|
| Tác giả | BE (agent, DEC-16) |
| Reviewer | ai-lead-review (subagent) |
| Trạng thái | Approved (G2 ✅ 2026-10-24 · agent theo DEC-16, review subagent 2 vòng) |
| Tổng quan & contract | [02-tech-spec.md](02-tech-spec.md) v0.2 |
| Last update | 2026-10-24 · BE |

> **TL;DR**
> - `packages/core`: schema `HouseDocument` (zod), hình học mm, `wallSegments`, diện tích, `planSvg` có escape, `submitChecks` (bảng mã 02 §5.3), `normalizePhoneVN`.
> - `apps/api`: Fastify 5 + `node:sqlite` (WAL), 17 bảng, migration SQL đánh số. Có repository, service, route; phục vụ web (SPA fallback, thẻ OG, CSP); job runner có 2 làn (email; mô hình chạy trong worker thread).
> - Phần khó nhất:
>   - bản ghi gửi duyệt bất biến (`submissions`) cùng quyền đọc file theo quan hệ;
>   - pipeline GLB gộp có chọn lọc, giữ node `item_*`/`wall_*`;
>   - quyền theo khách hàng trên mọi truy vấn và theo từng field khi sửa dự án.

---

## 1. Phạm vi

| Goals | Non-goals (để đâu) |
|---|---|
| API-01…05, 10…13, 20…23, 30…39, 40…41, 50…55, 60…63, 70…72, 80…81, `/files`, `/healthz`, phục vụ web | DXF, trần/điện, TCVN khung tên (P2) |
| Job: tối ưu mô hình (worker thread), gửi email, nhắc duyệt | Công cụ xoá dữ liệu sau 90 ngày (BR-08) — QTV làm tay, P2 |
| `core`: schema, hình học, diện tích, mặt bằng SVG, kiểm gửi duyệt, chuẩn hoá SĐT | Xuất PDF (FE làm trong trình duyệt) |
| Seed: 1 QTV, 1 khách hàng demo, 4 mẫu nhà theo AC-01 | Hạ tầng production (`05`) |

| API / job | FR |
|---|---|
| API-01…05 | 01.05, NFR-05 |
| API-10…13 | 01.01, 01.04, 01.06 |
| API-20…23 | 01.02, 01.03, 02.01, 02.02 |
| API-30…36, 39 | 03.01, 03.02–03.09, 04.05–04.07, 05.02–05.04, 08.01, 08.03 |
| API-37, 38, job `model.optimize` | 04.01–04.03, 05.01 |
| API-40, 41 | 05.01 |
| API-50…55, job `review.remind` | 08.01–08.09 |
| API-60, 61, `/files`, phục vụ web + OG | 06.*, 07.*, 09.01, 06.14 |
| API-62, 70…72, E5 | 10.01–10.06 |
| API-63, 80, 81 | 11.01–11.03, 09.04 |

## 2. Cấu trúc code

Kiến trúc theo lớp: `routes` (HTTP, validate) → `services` (nghiệp vụ, transaction) → `repos` (SQL) → `db`.

| Layer / module | File | Mới / sửa | Trách nhiệm |
|---|---|:---:|---|
| Workspace | `package.json` (root, npm workspaces), `tsconfig.base.json` | sửa / mới | Workspaces `packages/*`, `apps/*`; script `dev`, `build`, `test`, `lint` |
| core | `packages/core/src/schema.ts` | mới | zod `HouseDocument` (≤ 10 tầng), enum (02 §6.1), type `Snapshot`, `PublicHousePayload` |
| core | `packages/core/src/geometry.ts` | mới | Point, polygon area/centroid/contains/self-intersect, wall rectangle, `wallSegments(floor)` (đoạn đặc + lỗ cửa theo tường xiên), side test |
| core | `packages/core/src/rules.ts` | mới | `roomArea`, `floorGrossArea`, `assignItemsToRooms`, `submitChecks` (02 §5.3), `budgetForFloor`, `normalizePhoneVN`, `formatArea`, `DEFAULT_DISCLAIMER`, `DEFAULT_PRIVACY_POLICY`, `cloneDocument`, `emptyDocument`, `stripUnderlay` |
| core | `packages/core/src/plan/planSvg.ts`, `plan/dimensions.ts`, `plan/escape.ts` | mới | SVG mặt bằng có kích thước; mọi chuỗi qua `escapeXml` |
| core | `packages/core/src/ids.ts` | mới | `newId(prefix)` (16 ký tự base32, crypto) |
| api | `apps/api/src/main.ts`, `server.ts`, `config.ts` | mới | Khởi động, đăng ký plugin/route, đọc env, chặn khởi động thiếu secret ở production |
| api | `apps/api/src/db/sqlite.ts`, `db/migrate.ts`, `db/migrations/001_init.sql` | mới | `DatabaseSync`, WAL, `foreign_keys=ON`, helper `tx(fn)` (`BEGIN IMMEDIATE`), migration |
| api | `apps/api/src/lib/errors.ts`, `lib/auth.ts`, `lib/csrf.ts`, `lib/rateLimit.ts`, `lib/time.ts`, `lib/formToken.ts`, `lib/csv.ts` | mới | Lỗi chuẩn; scrypt + phiên + `requireUser`; CSRF; giới hạn tần suất; ngày làm việc VN; HMAC form token; CSV an toàn |
| api | `apps/api/src/storage/storage.ts`, `storage/localDisk.ts` | mới | Interface `put/stream/path/url`; lưu `DATA_DIR/files/<key>` |
| api | `apps/api/src/repos/*.ts` | mới | clients, users, sessions, tokens, projects, houses, versions, submissions, reviews, models, library, files, leads, events, jobs, outbox |
| api | `apps/api/src/services/*.ts` | mới | auth, access (quyền + availability), workflow, snapshot, fileAccess, models, leads, stats |
| api | `apps/api/src/routes/*.ts` | mới | Mỗi nhóm API một file; zod validate |
| api | `apps/api/src/routes/web.ts` | mới | CSP đúng chuỗi 02 §8 (gồm `wasm-unsafe-eval`, Turnstile frame/connect, `blob:`). Phục vụ `WEB_DIST`: `/v/*` → `viewer.html` + chèn OG; `/portal/*`, `/studio/*` → `app.html`; `/` → `/studio`; header CSP theo entry (02 §8); `Referrer-Policy: no-referrer` (R-14) |
| api | `apps/api/src/jobs/runner.ts`, `jobs/modelWorker.ts`, `jobs/modelOptimize.ts`, `jobs/email.ts`, `jobs/reviewReminder.ts` | mới | Hai làn job; tối ưu GLB trong `worker_threads` |
| api | `apps/api/src/email/templates.ts`, `email/transport.ts` | mới | E1–E5 tiếng Việt; SMTP hoặc console + `DATA_DIR/mail/` |
| api | `apps/api/src/seed/seed.ts`, `seed/demoHouses.ts` | mới | Dữ liệu mẫu |
| api | `apps/api/test/*.test.ts` | mới | Integration bằng `app.inject` |

## 3. Data

Kiểu SQLite: `TEXT`, `INTEGER`, `REAL`. Thời điểm là `TEXT` ISO-8601 UTC. JSON là `TEXT`, parse ở repo. Khoá chính dạng `<prefix>_<16 ký tự>`. Ràng buộc slug dùng chung cho projects/houses: `CHECK (length(slug) BETWEEN 3 AND 60 AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*')` (R-21).

| Bảng | Field | Null | Default | Index / ràng buộc |
|---|---|:---:|---|---|
| clients | id · name · logo_file_id · brand_color · contact_json · plan · hosting_until (YYYY-MM-DD) · status · show_powered_by · created_at · updated_at | logo, plan, hosting_until | brand_color `#1F4FA3`, contact `{}`, status `active`, show 1 | CHECK status IN (active, suspended); CHECK plan IN (unit, project, library); CHECK brand_color GLOB `#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]` |
| users | id · email · name · role · client_id · password_hash · status · failed_logins · locked_until · created_at · updated_at | client_id, password_hash, locked_until | status `invited`, failed 0 | UNIQUE(email COLLATE NOCASE); CHECK role IN (admin, producer, approver); CHECK status IN (invited, active, disabled); CHECK (role ≠ approver OR client_id NOT NULL) |
| sessions | id (sha256 token) · user_id · expires_at · created_at | | | idx(user_id); FK ON DELETE CASCADE |
| tokens | id (sha256) · user_id · kind · expires_at · used_at | used_at | | CHECK kind IN (invite, reset) |
| projects | id · client_id · slug · slug_locked · name · location · description · cover_file_id · contact_json · disclaimer · privacy_policy · status · created_at · updated_at | location, description, cover, disclaimer, privacy_policy | slug_locked 0, status `active` | UNIQUE(slug); CHECK slug (trên); FK client_id |
| houses | id · project_id · slug · slug_locked · name · house_type · declared_area · bedrooms · bathrooms · description · published_version_id · sort_order · created_at · updated_at | description, published_version_id | slug_locked 0, sort 0 | UNIQUE(project_id, slug); CHECK slug; CHECK house_type IN (apartment, townhouse, villa, cottage) |
| versions | id · house_id · number · state · document · revision · current_submission_id · published_at · published_by · created_at · updated_at | current_submission_id, published_* | revision 0, state `draft` | UNIQUE(house_id, number); CHECK state IN (draft, pending_review, approved, published, superseded, unpublished); **UNIQUE INDEX one_open ON versions(house_id) WHERE state IN ('draft','pending_review','approved')**; **UNIQUE INDEX one_published ON versions(house_id) WHERE state='published'** (BR-02, R-18) |
| submissions | id · version_id · seq · snapshot · snapshot_hash · submitted_at · submitted_by · withdrawn_at · withdrawn_by · reminded_at | withdrawn_*, reminded_at | | UNIQUE(version_id, seq); **TRIGGER chặn DELETE và chặn UPDATE các cột snapshot, snapshot_hash, version_id, seq, submitted_*** (R-12) |
| submission_files | submission_id · storage_key | | | PK(submission_id, storage_key); idx(storage_key) |
| reviews | id · submission_id · version_id · decision · note · targets_json · user_id · on_behalf · evidence_file_id · snapshot_hash · created_at | note, evidence | targets `[]`, on_behalf 0 | CHECK decision IN (approved, changes_requested); UNIQUE(submission_id) (một quyết định mỗi lần gửi); **TRIGGER chặn UPDATE/DELETE** (BR-03) |
| model_assets | id · project_id · original_file_id · optimized_file_id · status · error · report_json · level · reasons_json · created_by · created_at · updated_at | project_id (null = thư viện), optimized, error, report, level | status `processing` | CHECK status IN (processing, ready, failed); CHECK level IN (ok, warn, block) |
| library_items | id · name · category · size_json · material · brand · description · image_file_ids_json · model_asset_id · fallback_shape · variants_json · archived · created_at · updated_at | material, brand, description, model_asset_id, fallback_shape | images `[]`, variants `[]`, archived 0 | idx(category); CHECK category IN (02 §6.1) |
| files | id · project_id · kind · original_name · mime · bytes · storage_key · uploaded_by · created_at | project_id | | UNIQUE(storage_key); CHECK kind IN (input, logo, cover, gallery_image, library_image, item_image, model_original, model_optimized, evidence) |
| leads | id · project_id · house_id · name · phone · email · interest · message · consent_at · context_json · source · device_id · contact_count · status · created_at · last_contact_at | house_id, name, email, interest, message, device_id | count 1, status `new` | idx(project_id, created_at); idx(project_id, phone, last_contact_at); CHECK interest IN (live, invest, interior, other) |
| view_events | id INTEGER AUTOINCREMENT · project_id · house_id · session_id · device_id · type · target_id · source · device_class · ts | house_id, target_id | | idx(project_id, ts); idx(project_id, session_id) |
| jobs | id · lane · kind · payload_json · status · attempts · run_at · last_error · created_at · updated_at | last_error | status `queued`, attempts 0 | CHECK lane IN (model, mail, cron); idx(lane, status, run_at) |
| outbox_emails | id · to_addr · template · data_json · lead_id · status · attempts · last_error · created_at · sent_at | lead_id, last_error, sent_at | status `queued` | idx(status); idx(lead_id) |
| schema_migrations | version · applied_at | | | PK version |

**Migration:** `001_init.sql` tạo toàn bộ bảng, index và trigger. `migrate.ts` khi khởi động đọc các file `NNN_*.sql` chưa áp dụng, chạy trong transaction, ghi `schema_migrations`. Chưa có dữ liệu thật nên không cần backfill. Bản down `001_init.down.sql` chỉ dùng ở dev. Luật sau go-live: chỉ thêm, không xoá hay đổi tên cột.

**Dữ liệu nhạy cảm:**
- `password_hash`: scrypt.
- Token phiên/mời/đặt lại chỉ lưu sha256.
- `leads.phone`, `name`, `email`, `message`: redact khỏi log; xoá cứng qua API-71 kèm `UPDATE outbox_emails SET data_json='{}', to_addr=to_addr WHERE lead_id=?` (R-26).
- File `input`, `evidence`, `model_original` không bao giờ nằm trong `submission_files` (đảm bảo bằng `snapshot.build` + test).

## 4. Implement API

Mỗi route: zod parse body/query → `requireUser(roles)` → service → JSON.
- `requireUser` tải user mới từ DB theo phiên mỗi request. `user.status ≠ active` → 401. Approver mà client `suspended` → 403 `ACCOUNT_DISABLED` (R-19).
- `access.assertProject(user, projectId)`: A, P mọi dự án; R chỉ khi `project.client_id = user.client_id`.
- Producer gọi API-70…81 → 403.

| API | Validate input | AuthZ | Logic chính | Transaction / lock | Lỗi |
|---|---|---|---|---|---|
| 01 login | email, password ≤ 200 | — | `locked_until > now` → 423; verify; sai → failed+1, ≥ 5 → khoá 15 phút; status `invited`/`disabled` hoặc client suspended (approver) → 403; đúng → reset failed, tạo session, cookie | tx | INVALID_CREDENTIALS, ACCOUNT_LOCKED, ACCOUNT_DISABLED |
| 02 logout | — | phiên | Xoá session, clear cookie | | |
| 03 me | — | phiên | 02 §6.1 | | 401 |
| 04 forgot | email | — | Luôn 204; user active → token reset 1 giờ + E2 (link `…/set-password#token=…`) | | |
| 05 set | token, password ≥ 8 | — | sha256 khớp, chưa dùng, chưa hết hạn → hash, status active, used_at, xoá phiên cũ, tạo phiên mới | tx | TOKEN_INVALID, VALIDATION_ERROR |
| 10/11 clients | name 1–200, brandColor, plan enum, hostingUntil date, contact.* (phone qua normalizePhoneVN) | A | CRUD; PATCH `status: suspended` → xoá phiên của mọi approver thuộc client (R-19) | tx | VALIDATION_ERROR |
| 12/13 users | email, name, role, clientId (approver bắt buộc, tồn tại) | A | Tạo invited + token mời 72 giờ + E1 (link `#token=`); PATCH `disabled` → xoá phiên; không cho vô hiệu/đổi vai trò admin active cuối cùng | tx | EMAIL_TAKEN, LAST_ADMIN, INVALID_STATE (resend khi không invited) |
| 20 projects | slug, name, leadEmails ≤ 5 email hợp lệ, privacyPolicy ≤ 20.000 ký tự | list: A,P mọi; R lọc client; POST A | | | SLUG_TAKEN |
| 21 project | như 20 (partial) | GET A,P,R(scope); PATCH: A mọi field; **P chỉ** name, location, description, coverFileId — có field khác → 403 `FIELD_FORBIDDEN` (R-03) | slug đổi khi `slug_locked=1` → 409 SLUG_LOCKED | | FIELD_FORBIDDEN, SLUG_LOCKED, SLUG_TAKEN |
| 22 project files | multipart ≤ 200 MB; mime jpg/png/webp/pdf/glb/gltf/dxf | A,P + assertProject | Stream vào storage, insert kind=input | | FILE_TOO_LARGE, UNSUPPORTED_FILE |
| 23 files | kind ∈ logo, cover, gallery_image, library_image, item_image, evidence; projectId bắt buộc với cover, gallery_image, item_image, evidence | A,P (evidence: chỉ A) | | | FORBIDDEN |
| 30 houses | slug unique trong project; houseType; declaredArea 1–100000; bedrooms/bathrooms 0–50 | đọc A,P,R(scope); tạo A,P | Tạo house + version 1 draft (`emptyDocument()`: 1 tầng "Tầng 1", elevation 0, height 3300) | tx | SLUG_TAKEN |
| 31 house | partial | | slug khoá như 21 | | SLUG_TAKEN, SLUG_LOCKED |
| 32 duplicate | name, slug | A,P | Tài liệu version mới nhất → `cloneDocument` (đổi mọi id, giữ tham chiếu nội bộ) → house mới + version 1 draft | tx | SLUG_TAKEN |
| 33 versions | — | A,P,R(scope) | 02 §6.1 | | |
| 34 version | — | A,P: document, revision, `checks`; R: chỉ khi state ≠ draft → submission hiện tại (snapshot, không document gốc); R + draft → chỉ metadata (02 §6.1, R-11) | `checks = core.submitChecks(document, modelsOf(document))` | | |
| 35 save document | If-Match int; body zod strict ≤ 5 MB; **kiểm tham chiếu** (R-34): wallId của opening, roomId, toFloorId, modelAssetId thuộc project (hoặc thư viện), libraryItemId tồn tại và không archived, fileId thuộc project | A,P + assertProject | state phải `draft`; `UPDATE … SET document, revision=revision+1 WHERE id=? AND revision=? AND state='draft'` → 0 hàng → phân biệt 409 REVISION_CONFLICT / VERSION_LOCKED | lệnh có điều kiện | REVISION_CONFLICT, VERSION_LOCKED, DOCUMENT_INVALID (fields = đường dẫn JSON) |
| 36 new version | — | A,P | Có version mở → 409 DRAFT_EXISTS; tạo number+1 với document của version mới nhất | tx + one_open | DRAFT_EXISTS |
| 37 upload model | `.glb`/`.gltf` ≤ 200 MB | A,P + assertProject; `/library/models` A,P | Lưu file model_original, tạo model_asset processing, enqueue job lane `model` | tx | UNSUPPORTED_FILE, FILE_TOO_LARGE |
| 38 model | — | A,P | status, url, report, level, reasons | | |
| 39 preview | — | A,P mọi state; R state ≠ draft + scope | draft → `snapshot.build(version, {includeUnderlay:false})` tại chỗ (không lưu); khác → snapshot của `current_submission_id` (hoặc submission cuối nếu published/superseded/unpublished); ghép branding/contact/disclaimer hiện tại; thêm `preview` meta; **không** phát `antiBot` | | 403, 404 |
| 40/41 library | name, category enum, sizeMm 3 số 1–20000, variants id unique, color `#RRGGBB`, fallbackShape enum | A,P | DELETE: quét document của version open/published và snapshot của submission đang published có `libraryItemId` → > 0 thì 409 `ITEM_IN_USE` + usage; = 0 thì `archived=1` | | ITEM_IN_USE |
| 50 submit | — | A | state=draft; `submitChecks` có block → 422 SUBMIT_BLOCKED (+checks); `snapshot.build()` (§4.1) → insert submission (seq+1, hash) + submission_files; version state=pending_review, current_submission_id; E3 cho mọi approver active của client | tx | SUBMIT_BLOCKED, INVALID_STATE |
| 51 withdraw | — | A | pending_review → draft; submission.withdrawn_at/by | tx | INVALID_STATE |
| 52 review | decision; note ≥ 10 khi changes_requested; targets ≤ 50 | R + scope | state=pending_review; insert review (submission_id = current, snapshot_hash); approved → state approved; changes_requested → draft | tx; UNIQUE(submission_id) chặn duyệt 2 lần | INVALID_STATE, VALIDATION_ERROR |
| 53 on behalf | decision, note ≥ 10, evidenceFileId (kind evidence cùng project) | A | Như 52, on_behalf=1 | tx | VALIDATION_ERROR, INVALID_STATE |
| 54 publish | — | A | state ∈ (approved, superseded, unpublished) và có submission đã duyệt (review approved cho submission đó); bản đang published → superseded; version → published; house.published_version_id; `slug_locked=1` cho house và project | tx; one_published | INVALID_STATE |
| 55 unpublish | — | A | published → unpublished; published_version_id=null | tx | INVALID_STATE |
| 60 public project | slug | — | `availability(project)` (BR-08) → 410; houses có published_version_id (sort_order), cover/meta từ snapshot; `antiBot.formToken = formToken.issue()`; `turnstileSiteKey` từ config | | NOT_FOUND, PROJECT_UNAVAILABLE |
| 61 public house | slug, houseSlug | — | Snapshot của submission được duyệt thuộc version published (house meta từ snapshot) + branding/contact hiện tại + antiBot | | NOT_FOUND, PROJECT_UNAVAILABLE |
| 62 lead | 02 §6; phone `normalizePhoneVN`; consent === true; name ≤ 100; message ≤ 1000; interest enum | — | availability → 410. `website` khác rỗng → trả 201 giả `{lead:{id:'led_ignored'}, merged:false}`, không lưu. `formToken.verify` (≥ 3 giây, ≤ 2 giờ) sai → 429 CAPTCHA_REQUIRED. rateLimit deviceId 3/10 phút, IP 20/10 phút → vượt → 429 CAPTCHA_REQUIRED, trừ khi `captchaToken` qua Turnstile. Tìm lead cùng project+phone, last_contact_at ≥ now−24h → count+1, cập nhật context, last_contact_at → 200 merged; không → insert 201. E5 (cả khi gộp, tiêu đề "liên hệ lần {n}") tới `contact.leadEmails`, gắn `lead_id` | tx `BEGIN IMMEDIATE` | VALIDATION_ERROR, CAPTCHA_REQUIRED, PROJECT_UNAVAILABLE |
| 63 events | body ≤ 64 KB; ≤ 50 events; type enum; ts trong ±24h | — | rateLimit IP 120 lô/phút → 429 RATE_LIMITED; bỏ event sai; resolve houseSlug; insert hàng loạt | tx | 204; 400 khi sai cấu trúc |
| 70 leads | clientId? (chỉ A) projectId? houseId? from/to (giờ VN) status? limit/cursor | A; R: buộc client mình (bỏ qua clientId) | Lọc + phân trang (created_at DESC, id) | | |
| 71 lead patch/delete | status ∈ (new, contacted) | A; R scope | DELETE xoá cứng + che outbox (R-26) | tx | |
| 72 leads.csv | như 70 (≤ 10.000) | như 70 | `lib/csv.ts`: BOM, escape `"`, tiền tố `'` cho ô bắt đầu `= + - @` (R-27) | | |
| 80 stats | projectId (bắt buộc với R), clientId? (A), from/to (mặc định 30 ngày, tối đa 366 ngày), houseId? | A; R scope | §4.2 | | VALIDATION_ERROR (khoảng > 366 ngày) |
| 81 stats.csv | như 80 | | CSV daily + tổng (csv an toàn) | | |
| /files/:key | key | `fileAccess.canRead(user?, file)` theo 02 §6.2 | stream; header cache theo công khai/riêng | | 404 (không tiết lộ tồn tại) |
| web `/v/*` | — | — | Đọc `viewer.html` một lần (cache bộ nhớ). Với `/v/:slug(/:house)?`: gọi service public (không qua HTTP) lấy name, description, coverUrl → thay `<!--OG-->` bằng thẻ `og:*` đã escape; lỗi → bỏ OG. CSP viewer | | |
| web `/portal/*`, `/studio/*` | — | — | `app.html`, CSP app, `X-Robots-Tag: noindex` | | |

### 4.1 Snapshot
`snapshot.build(version)` trả object bất biến:
1. `document` = `stripUnderlay(cloneDeep(version.document))` — bỏ `underlay` mọi tầng (R-01).
2. `house` = name, houseType, declaredArea, bedrooms, bathrooms, description (R-05).
3. `resolved.libraryItems` theo mọi `libraryItemId`: name, category, sizeMm, material, brand, description, imageUrls, variants, modelUrl, fallbackShape.
4. `resolved.models` theo mọi `modelAssetId` (ModelRef, modelNode, model thư viện): `{ url, bbox, report }` (chỉ model `ready`).
5. `resolved.files` = coverFileId, gallery, ảnh trong `PlacedItem.info.imageFileIds` → URL.
6. `storageKeys` = mọi key ở bước 3–5 (chỉ kind cover, gallery_image, library_image, item_image, model_optimized). **Assert** không có kind input/evidence/model_original; vi phạm → lỗi INTERNAL và không tạo submission.

`snapshot_hash` = sha256 của JSON chuẩn hoá (khoá sắp xếp). Branding/contact/disclaimer/privacyPolicy lấy bản hiện tại ở API-39/60/61.

### 4.2 Thống kê
Truy vấn `view_events` trong [from, to] theo giờ VN:
- `views` = COUNT DISTINCT session_id có type ∈ (project_open, house_open).
- `uniqueViewers` = COUNT DISTINCT device_id.
- `avgDurationSec` = AVG(max(ts) − min(ts)) theo session.
- `daily` = GROUP BY date(ts, '+7 hours').
- `topRooms` = room_select GROUP BY house_id, target_id; tên phòng lấy từ snapshot của version đang published (cache bộ nhớ theo submission id).
- `topItems` = item_open, tên lấy từ snapshot.
- `bySource`, `byDevice` = theo session.
- `leads` đếm từ bảng leads trong khoảng.

Mỗi danh sách top lấy 10 dòng. Khoảng tối đa 366 ngày. Mục tiêu ≤ 1 giây với 100.000 sự kiện (đo trong IT).

## 5. Quy tắc nghiệp vụ → nơi thực thi

| BR | Thực thi ở | Test |
|---|---|---|
| BR-01 | `workflow.publish` (phải có review approved của submission) + PUT document chỉ khi draft | IT-workflow |
| BR-02 | `one_published` unique index + publish chuyển bản cũ → superseded cùng tx; URL theo slug khoá | IT-workflow, IT-slug-lock |
| BR-03 | Trigger chặn sửa/xoá `reviews` và cột bất biến của `submissions` | IT-immutable |
| BR-04 | `core.roomArea`, `floorGrossArea`, `formatArea` | UT-core-area (15,12 m²; 75,00 m²) |
| BR-05 | `submitChecks` (FLOOR_NOT_CALIBRATED); `planSvg` trả rỗng khi chưa hiệu chỉnh | UT-core-checks, IT-submit |
| BR-06 | `DEFAULT_DISCLAIMER` (core); API-39/60/61 trả `disclaimer` đã thay mặc định | IT-public |
| BR-07 | Job tính report từng model; `core.budgetForFloor` cộng theo góc xem tầng; `submitChecks` BUDGET_WARN/BLOCK | UT-budget, IT-submit |
| BR-08 | `access.availability(project)`: client suspended, hoặc `today_VN > hosting_until + 7 ngày`, hoặc project.status=unavailable | UT-availability (01/3 → 08/3) |
| BR-09 | `normalizePhoneVN` + gộp 24 giờ trong `leads.submit` | UT-phone, IT-lead-merge |
| BR-10 | Client tạo sessionId; server tính views theo session | IT-stats |
| BR-11 | `assertProject`, lọc client_id cho approver; producer bị chặn lead/stats; giới hạn field PATCH dự án | IT-authz-cross-client, IT-field-perms |
| BR-12 | Không có API sửa mặt bằng; mặt bằng = `core.planSvg(document)` | — |

## 6. Concurrency & toàn vẹn
- Autosave: khoá lạc quan `revision`, xem API-35.
- Một phiên bản mở và một phiên bản đã phát hành mỗi mẫu nhà: unique index một phần `one_open`, `one_published`.
- Workflow: mọi chuyển trạng thái `UPDATE … WHERE id=? AND state=?` trong `tx` (`BEGIN IMMEDIATE`). 0 hàng → 409 INVALID_STATE. `UNIQUE(submission_id)` ở reviews chặn duyệt hai lần.
- Gộp lead: `BEGIN IMMEDIATE` nên hai lead trùng gửi cùng lúc không tạo hai bản ghi.
- Job: mỗi làn một vòng lặp. Lấy job bằng `UPDATE jobs SET status='running' WHERE id=? AND status='queued'`. Khi khởi động, job `running` cũ → `queued` (khôi phục sau crash). Email idempotent theo `outbox_emails.id`.

## 7. Job nền · queue · tích hợp ngoài

| Tên | Làn | Trigger | Làm gì | Retry / timeout | Lỗi cuối thì |
|---|---|---|---|---|---|
| `model.optimize` | `model` (1 job/lúc) | API-37 | **Trong `worker_threads`** (R-08): gltf-transform `NodeIO` (KHR extensions + meshopt). Các bước: `dedup` → `prune` → **`collapseNamed`** (tự viết: với mỗi node khớp `^(item_\|wall_)` ở cấp cao nhất, bake transform cây con vào toạ độ của node đó, gom mọi primitive cây con thành một mesh của node, xoá con — N-02) → xoá tên node không khớp quy ước → `flatten` → `join({ keepNamed: true })` (gộp theo vật liệu, giữ node `item_*`/`wall_*`) → `weld` → `textureCompress` (sharp, WebP, ≤ 2048 px) → `quantize` → `EXT_meshopt_compression`. **Không** `instance` (R-07). Report: triangles, drawCalls (số primitive), textureBytes (Σ w·h·4·4/3), fileBytes, bbox (mét), `nodeNames` (danh sách `item_*`, `wall_*`). Level riêng của model theo ngưỡng tổng 02 (tham khảo); quyết định chặn ở `submitChecks` | 2 lần (1 phút, 5 phút); `worker.terminate()` sau 5 phút | status=failed, error tiếng Việt (EX-1) |
| `email.send` | `mail` (vòng riêng, poll 5 giây) | outbox queued | Render E1–E5, gửi SMTP hoặc console | 5 lần (1, 5, 15, 60, 240 phút) | status=failed, log |
| `review.remind` | `cron` (mỗi giờ) | — | Submission hiện tại của version pending_review, `reminded_at` null, đã qua ≥ 5 ngày làm việc (bỏ T7, CN, giờ VN) → E4, set reminded_at (cột ngoài trigger bất biến) | — | log |
| SMTP | | | nodemailer | timeout 20 giây | như email.send |
| Turnstile | | API-62 | POST siteverify | timeout 5 giây | coi như không hợp lệ |

**Spike bắt buộc trước khi chốt B6:** tạo GLB tổng hợp gồm 2.000 mesh, 40 vật liệu, 30 node `item_*` (một nửa là **nhóm lồng 3 cấp** nhiều mesh con), 60 node `wall_*`. Kiểm: mọi `item_*`/`wall_*` còn nguyên tên và là một node mesh; draw call phần không tên ≤ 40; tổng draw call được báo đúng; three.js tải được bằng MeshoptDecoder. Ghi kết quả vào `00-status`. Chưa có file SketchUp thật thì đánh dấu rủi ro BE-R4.

## 8. Cache & hiệu năng

| Chỗ | Chiến lược | Invalidate | Mục tiêu |
|---|---|---|---|
| API-60/61 | `Cache-Control: public, max-age=60` | Hết hạn 60 giây | NFR-01 |
| `/files` công khai | `immutable, max-age=31536000` | Không cần (key ngẫu nhiên) | NFR-01 |
| `/files` riêng | `private, no-store` | | |
| API-39 | `private, no-store` (N-06) | | |
| Tên phòng/đồ cho thống kê | Map bộ nhớ theo submission id | Không cần (bất biến) | API-80 ≤ 1 giây với 100.000 sự kiện |
| SQLite | WAL, `synchronous=NORMAL`, `busy_timeout=5000` | | |
| Sao lưu | `VACUUM INTO` lúc 03:00 (chặn luồng chính vài giây, chấp nhận) | | NFR-09 |

## 9. Config · secret · flag

| Key | Mặc định | Môi trường | Ý nghĩa |
|---|---|---|---|
| `PORT` | 8787 | mọi | |
| `DATA_DIR` | `./data` | mọi | `app.db`, `files/`, `mail/` |
| `PUBLIC_BASE_URL` | `http://localhost:5173` (dev, Vite proxy `/api`, `/files` → 8787) | mọi | Link trong email; đối chiếu `Origin` khi chống CSRF (N-3) |
| `WEB_DIST` | `apps/web/dist` | prod | Thư mục web build |
| `SMTP_URL` | trống → console | prod bắt buộc | |
| `MAIL_FROM` | `Nhà mẫu online <no-reply@localhost>` | | |
| `FORM_TOKEN_SECRET` | ngẫu nhiên lúc khởi động (dev) | prod bắt buộc | HMAC form token |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | trống | **prod bắt buộc** | Thiếu ở production → không khởi động |
| `COOKIE_SECURE` | `true` khi `NODE_ENV=production` | | |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `admin@local.test` / `admin12345` **chỉ khi `NODE_ENV=development`**; staging/prod bắt buộc đặt (N-4) | | |

## 10. Observability

| Loại | Nội dung | Ngưỡng cảnh báo |
|---|---|---|
| Log | pino JSON: reqId, method, url (bỏ query string), status, ms; redact `password`, `token`, `phone`, `email`, `name`, `message` | — |
| Log | job: lane, kind, id, attempt, ms, lỗi | job failed ≥ 1 trong 1 giờ |
| Health | `/healthz`: `{ db: "ok", jobsFailed24h, outboxQueued, modelQueue }` | outboxQueued > 50 |

## 11. Test BE

| Mức | Phạm vi | Case chính |
|---|---|---|
| Unit (core) | diện tích, diện tích sàn tầng, phone, submitChecks (mọi mã 02 §5.3), budgetForFloor, wallSegments (tường xiên, nhiều cửa), planSvg (kích thước, cung cửa, tên phòng, **escape `<script>` và `"onload=`**), cloneDocument, stripUnderlay | UT-core-* |
| Unit (api) | availability BR-08, ngày làm việc, formToken (< 3 giây, > 2 giờ, sai chữ ký), csv escape, scrypt | UT-* |
| Integration | auth (khoá 5 lần, vô hiệu → phiên mất), CRUD + quyền chéo khách hàng, **quyền theo field**, autosave 409 + kiểm tham chiếu, workflow đầy đủ + trạng thái sai + submission/review bất biến, preview (R draft → 403), public 404/410, **file input không bao giờ đọc được khi chưa đăng nhập hoặc với R**, lead gộp/429/honeypot/formToken, events + stats + rate limit, slug khoá, model optimize với GLB tổng hợp (giữ `item_*`) | IT-* |
| Contract | Response khớp 02 §6/§6.1 (zod schema response trong test) | CT-* |

## 12. Task

| # | Việc | FR / API | Phụ thuộc | Ước lượng |
|---|---|---|---|---|
| B1 | Monorepo + `core` schema/geometry/rules (+ wallSegments, budget, checks) + test | 02 §5, BR-04/05/07/09 | — | 1 ngày |
| B2 | `core.planSvg` + dimensions + escape + test | FR-07.01–07.02 | B1 | 1 ngày |
| B3 | API khung: server, config (kiểm secret prod), db + migration + trigger, errors, storage, healthz, **phục vụ web + SPA fallback + CSP + dev proxy** | — | B1 | 1 ngày |
| B4 | Auth + users + clients + thu hồi phiên + outbox/transport + E1/E2 | API-01…05, 10…13 | B3 | 1 ngày |
| B5 | Projects (quyền field, slug khoá) + files + houses + versions + autosave (kiểm tham chiếu) + duplicate | API-20…23, 30…36 | B4 | 1,5 ngày |
| B6 | **Spike GLB** + model upload + worker optimize + report | API-37, 38 | B5 | 1,5 ngày |
| B7 | Library | API-40, 41 | B5 | 0,5 ngày |
| B8 | Workflow + submissions + snapshot + fileAccess + preview + E3/E4 | API-39, 50…55 | B5, B6, B7 | 1,5 ngày |
| B9 | Public API + `/files` + availability + chèn OG + form token | API-60, 61 | B8 | 0,5 ngày |
| B10 | Leads + chống bot + E5 + CSV | API-62, 70…72 | B9 | 1 ngày |
| B11 | Events + stats + CSV | API-63, 80, 81 | B9 | 0,5 ngày |
| B12 | Seed 4 mẫu nhà AC-01 | AC-01 | B8 | 0,5 ngày |
| B13 | Cập nhật `.ai/profile.md` (component api, lệnh) + `system-map.md` (N-2) | — | B11 | 0,25 ngày |

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Chọn? |
|---|---|---|---|
| ORM (Drizzle/Kysely) vs SQL thuần trên `node:sqlite` | ORM có type | Chưa hỗ trợ ổn định `node:sqlite` | SQL thuần + repo có type (DEC-21) |
| Gộp mesh: không join vs join toàn bộ vs join giữ `item_*`/`wall_*` | — | Không join: vượt draw call; join toàn bộ: mất đối tượng gắn đồ | Join giữ node theo quy ước (DEC-22 sửa) |
| Tự gỡ dự án quá hạn bằng job vs tính lúc đọc | Job: rõ thời điểm | Lệch khi gia hạn | Tính lúc đọc (DEC-23) |
| Phiên JWT vs bảng session | JWT không cần DB | Khó thu hồi | Bảng session + thu hồi khi vô hiệu |
| Lưu snapshot trên version vs bảng submission | Đơn giản | Mất nội dung đã bị từ chối, review không chứng minh được | Bảng submission (DEC-30) |

## Rủi ro & câu hỏi mở

| ID | Rủi ro / câu hỏi | Ảnh hưởng | Giảm thiểu | Hạn |
|---|---|---|---|---|
| BE-R1 | sharp/meshoptimizer không cài được | Không nén | Bỏ bước nén, cảnh báo trong report | B6 |
| BE-R2 | GLB rất lớn tốn RAM worker | Server chậm | 200 MB tối đa; UI khuyến cáo ≤ 100 MB; terminate 5 phút | B6 |
| BE-R3 | Thống kê chậm khi dữ liệu lớn | NFR | Index; giới hạn 366 ngày; ADR-002 điều kiện xem lại | B11 |
| BE-R4 | Chưa có file SketchUp/3ds Max thật để kiểm quy ước node | Gắn đồ/cắt tường kém | Spike GLB tổng hợp; kiểm lại với file thật ở pilot | G4 |

## Decisions

| DEC | Bối cảnh | Lựa chọn | Lý do | Người chốt |
|---|---|---|---|---|
| DEC-21 | Truy cập DB | SQL thuần trên `node:sqlite` qua repo | Không phụ thuộc ORM chưa hỗ trợ | Agent |
| DEC-22 (v0.2) | Tối ưu GLB | Join theo vật liệu, giữ node `item_*`/`wall_*`; bỏ `instance` | Vừa giảm draw call vừa gắn đồ được (R-07) | Agent |
| DEC-23 | BR-08 | Tính khả dụng lúc đọc | Tự khôi phục khi gia hạn | Agent |
| DEC-32 | Job nặng (R-08) | Worker thread cho tối ưu GLB; làn email riêng | Không chặn API, E5 ≤ 5 phút | Agent |
| DEC-33 | Chống bot (R-13) | Honeypot + form token HMAC + giới hạn tần suất + Turnstile bắt buộc ở prod | Không có lối vượt bằng chuỗi cố định | Agent |
