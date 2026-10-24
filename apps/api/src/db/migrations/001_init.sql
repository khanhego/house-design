-- 001_init — schema Phase 1 (02a §3). Thời điểm: TEXT ISO-8601 UTC. JSON: TEXT.

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_file_id TEXT,
  brand_color TEXT NOT NULL DEFAULT '#1F4FA3'
    CHECK (brand_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  contact_json TEXT NOT NULL DEFAULT '{}',
  plan TEXT CHECK (plan IS NULL OR plan IN ('unit', 'project', 'library')),
  hosting_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  show_powered_by INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'producer', 'approver')),
  client_id TEXT REFERENCES clients(id),
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (role <> 'approver' OR client_id IS NOT NULL)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('invite', 'reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE files (
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
CREATE INDEX files_project ON files(project_id, kind);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) BETWEEN 3 AND 60 AND slug NOT GLOB '*[^a-z0-9-]*'
           AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'),
  slug_locked INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  cover_file_id TEXT,
  contact_json TEXT NOT NULL DEFAULT '{}',
  disclaimer TEXT,
  privacy_policy TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unavailable')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX projects_client ON projects(client_id);

CREATE TABLE houses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  slug TEXT NOT NULL
    CHECK (length(slug) BETWEEN 3 AND 60 AND slug NOT GLOB '*[^a-z0-9-]*'
           AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'),
  slug_locked INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  house_type TEXT NOT NULL CHECK (house_type IN ('apartment', 'townhouse', 'villa', 'cottage')),
  declared_area REAL NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  bathrooms INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  published_version_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, slug)
);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id),
  number INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'pending_review', 'approved', 'published', 'superseded', 'unpublished')),
  document TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  current_submission_id TEXT,
  published_at TEXT,
  published_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (house_id, number)
);
CREATE UNIQUE INDEX versions_one_open ON versions(house_id) WHERE state IN ('draft', 'pending_review', 'approved');
CREATE UNIQUE INDEX versions_one_published ON versions(house_id) WHERE state = 'published';

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES versions(id),
  seq INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  withdrawn_at TEXT,
  withdrawn_by TEXT,
  reminded_at TEXT,
  UNIQUE (version_id, seq)
);
CREATE TRIGGER submissions_no_delete BEFORE DELETE ON submissions
BEGIN SELECT RAISE(ABORT, 'submissions are immutable'); END;
CREATE TRIGGER submissions_immutable BEFORE UPDATE OF version_id, seq, snapshot, snapshot_hash, submitted_at, submitted_by ON submissions
BEGIN SELECT RAISE(ABORT, 'submissions are immutable'); END;

CREATE TABLE submission_files (
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  storage_key TEXT NOT NULL,
  PRIMARY KEY (submission_id, storage_key)
);
CREATE INDEX submission_files_key ON submission_files(storage_key);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  version_id TEXT NOT NULL REFERENCES versions(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  note TEXT,
  targets_json TEXT NOT NULL DEFAULT '[]',
  user_id TEXT NOT NULL,
  on_behalf INTEGER NOT NULL DEFAULT 0,
  evidence_file_id TEXT,
  snapshot_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER reviews_no_update BEFORE UPDATE ON reviews
BEGIN SELECT RAISE(ABORT, 'reviews are immutable'); END;
CREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews
BEGIN SELECT RAISE(ABORT, 'reviews are immutable'); END;

CREATE TABLE model_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  original_file_id TEXT NOT NULL,
  optimized_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error TEXT,
  report_json TEXT,
  level TEXT CHECK (level IS NULL OR level IN ('ok', 'warn', 'block')),
  reasons_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE library_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sofa', 'chair', 'table', 'bed', 'storage', 'kitchen', 'appliance', 'bath',
                                             'lighting', 'decor', 'plant', 'rug', 'other')),
  size_json TEXT NOT NULL,
  material TEXT,
  brand TEXT,
  description TEXT,
  image_file_ids_json TEXT NOT NULL DEFAULT '[]',
  model_asset_id TEXT,
  fallback_shape TEXT,
  variants_json TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX library_items_category ON library_items(category);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  house_id TEXT,
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  interest TEXT CHECK (interest IS NULL OR interest IN ('live', 'invest', 'interior', 'other')),
  message TEXT,
  consent_at TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'link' CHECK (source IN ('link', 'qr', 'embed')),
  device_id TEXT,
  contact_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted')),
  created_at TEXT NOT NULL,
  last_contact_at TEXT NOT NULL
);
CREATE INDEX leads_project_created ON leads(project_id, created_at);
CREATE INDEX leads_project_phone ON leads(project_id, phone, last_contact_at);

CREATE TABLE view_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  house_id TEXT,
  session_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL,
  target_id TEXT,
  source TEXT NOT NULL,
  device_class TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX view_events_project_ts ON view_events(project_id, ts);
CREATE INDEX view_events_project_session ON view_events(project_id, session_id);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  lane TEXT NOT NULL CHECK (lane IN ('model', 'mail', 'cron')),
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_lane_status ON jobs(lane, status, run_at);

CREATE TABLE outbox_emails (
  id TEXT PRIMARY KEY,
  to_addr TEXT NOT NULL,
  template TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  lead_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX outbox_status ON outbox_emails(status, run_at);
CREATE INDEX outbox_lead ON outbox_emails(lead_id);
