-- Item 02 (Tham quan ảnh thật): thêm loại tệp tour_image, tour_clip.
-- SQLite không sửa được CHECK → dựng lại bảng files, giữ nguyên dữ liệu.
CREATE TABLE files_new (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('input', 'logo', 'cover', 'gallery_image', 'library_image', 'item_image',
                                     'model_original', 'model_optimized', 'evidence', 'tour_image', 'tour_clip')),
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO files_new SELECT id, project_id, kind, original_name, mime, bytes, storage_key, uploaded_by, created_at FROM files;
DROP TABLE files;
ALTER TABLE files_new RENAME TO files;
CREATE INDEX files_project ON files(project_id, kind);
