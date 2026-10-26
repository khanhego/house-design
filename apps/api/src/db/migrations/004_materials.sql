-- Item 03 (Đồ thật trong nhà 3D) lát R1: thư viện vật liệu + loại tệp material_texture.
-- SQLite không sửa được CHECK → dựng lại bảng files, giữ nguyên dữ liệu (như 002).
CREATE TABLE files_new (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('input', 'logo', 'cover', 'gallery_image', 'library_image', 'item_image',
                                     'model_original', 'model_optimized', 'evidence', 'tour_image', 'tour_clip',
                                     'material_texture')),
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

CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE CHECK (key GLOB '[a-z0-9]*' AND length(key) <= 64),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('wood', 'tile', 'stone', 'concrete', 'paint', 'plaster', 'brick', 'metal', 'fabric', 'other')),
  tile_w_mm REAL NOT NULL CHECK (tile_w_mm > 0),
  tile_h_mm REAL NOT NULL CHECK (tile_h_mm > 0),
  color TEXT NOT NULL,
  roughness REAL NOT NULL CHECK (roughness >= 0 AND roughness <= 1),
  metalness REAL NOT NULL DEFAULT 0 CHECK (metalness >= 0 AND metalness <= 1),
  color_file_id TEXT, color_small_file_id TEXT,
  normal_file_id TEXT, normal_small_file_id TEXT,
  rough_file_id TEXT, rough_small_file_id TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('free_library', 'ai', 'client_file', 'in_house')),
  source_name TEXT,
  source_url TEXT,
  license TEXT CHECK (license IS NULL OR license IN ('cc0', 'cc_by', 'commercial', 'client_exclusive')),
  attribution TEXT,
  client_id TEXT REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'retired')),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX materials_scope ON materials(client_id, status);
