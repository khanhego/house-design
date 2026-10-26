-- Hoàn tác 005: bỏ cột thêm của thư viện đồ và mô hình (tệp bản nhẹ để lại, không còn tham chiếu).
DROP INDEX library_scope;
ALTER TABLE library_items DROP COLUMN product_code;
ALTER TABLE library_items DROP COLUMN source_kind;
ALTER TABLE library_items DROP COLUMN source_name;
ALTER TABLE library_items DROP COLUMN source_url;
ALTER TABLE library_items DROP COLUMN license;
ALTER TABLE library_items DROP COLUMN attribution;
ALTER TABLE library_items DROP COLUMN client_id;
ALTER TABLE library_items DROP COLUMN status;
ALTER TABLE library_items DROP COLUMN approved_by;
ALTER TABLE library_items DROP COLUMN approved_at;
ALTER TABLE library_items DROP COLUMN size_accepted;
ALTER TABLE model_assets DROP COLUMN light_file_id;
ALTER TABLE model_assets DROP COLUMN light_report_json;
ALTER TABLE model_assets DROP COLUMN normalize_json;
DELETE FROM schema_migrations WHERE version = '005';
