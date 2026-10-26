-- Item 03 (Đồ thật trong nhà 3D) lát R2: mô hình đồ chân thực — nguồn & giấy phép, phạm vi khách, trạng thái duyệt
-- cho món đồ; bản nhẹ + kết quả chuẩn hoá cho mô hình.
ALTER TABLE library_items ADD COLUMN product_code TEXT;
ALTER TABLE library_items ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'in_house' CHECK (source_kind IN ('free_library', 'ai', 'client_file', 'in_house'));
ALTER TABLE library_items ADD COLUMN source_name TEXT;
ALTER TABLE library_items ADD COLUMN source_url TEXT;
ALTER TABLE library_items ADD COLUMN license TEXT CHECK (license IS NULL OR license IN ('cc0', 'cc_by', 'commercial', 'client_exclusive'));
ALTER TABLE library_items ADD COLUMN attribution TEXT;
ALTER TABLE library_items ADD COLUMN client_id TEXT REFERENCES clients(id);
ALTER TABLE library_items ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'retired'));
ALTER TABLE library_items ADD COLUMN approved_by TEXT;
ALTER TABLE library_items ADD COLUMN approved_at TEXT;
-- người dựng đã chọn co giãn mô hình theo kích thước khai báo khi lệch > 20% (BR-R4); đổi mô hình thì bỏ chọn
ALTER TABLE library_items ADD COLUMN size_accepted INTEGER NOT NULL DEFAULT 0;
-- đồ có sẵn là khối dựng do đội làm (DEC-R18)
UPDATE library_items SET source_name = 'Nhà mẫu online', license = 'cc0', status = 'ready', approved_at = updated_at;
CREATE INDEX library_scope ON library_items(client_id, status);

ALTER TABLE model_assets ADD COLUMN light_file_id TEXT;
ALTER TABLE model_assets ADD COLUMN light_report_json TEXT;
ALTER TABLE model_assets ADD COLUMN normalize_json TEXT;
