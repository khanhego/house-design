-- Hoàn tác 002: xoá tệp tour rồi dựng lại bảng với CHECK cũ.
DELETE FROM files WHERE kind IN ('tour_image', 'tour_clip');
CREATE TABLE files_old (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('input', 'logo', 'cover', 'gallery_image', 'library_image', 'item_image',
                                     'model_original', 'model_optimized', 'evidence')),
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO files_old SELECT * FROM files;
DROP TABLE files;
ALTER TABLE files_old RENAME TO files;
CREATE INDEX files_project ON files(project_id, kind);
DELETE FROM schema_migrations WHERE version = '002';
