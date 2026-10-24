-- Hoàn tác 003 (SQLite ≥ 3.35 hỗ trợ DROP COLUMN).
ALTER TABLE houses DROP COLUMN features_json;
ALTER TABLE houses DROP COLUMN land_area;
ALTER TABLE houses DROP COLUMN price;
DELETE FROM schema_migrations WHERE version = '003';
