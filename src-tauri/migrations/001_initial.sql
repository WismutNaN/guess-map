-- Region: geographic region with geometry reference and anchor point
CREATE TABLE IF NOT EXISTS region (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    country_code TEXT,
    region_level TEXT NOT NULL CHECK (region_level IN ('country', 'admin1', 'admin2', 'theme_region')),
    parent_id TEXT REFERENCES region(id) ON DELETE SET NULL,
    geometry_ref TEXT,
    anchor_lng REAL,
    anchor_lat REAL,
    anchor_offset_x REAL DEFAULT 0,
    anchor_offset_y REAL DEFAULT 0,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_region_country ON region(country_code);
CREATE INDEX IF NOT EXISTS idx_region_level ON region(region_level);
CREATE INDEX IF NOT EXISTS idx_region_parent ON region(parent_id);
CREATE INDEX IF NOT EXISTS idx_region_name ON region(name);
CREATE INDEX IF NOT EXISTS idx_region_name_en ON region(name_en);

-- HintType: catalog of hint types with JSON Schema for extensibility
CREATE TABLE IF NOT EXISTS hint_type (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    display_family TEXT NOT NULL CHECK (display_family IN ('polygon_fill', 'icon', 'text', 'image', 'composite')),
    default_icon TEXT,
    schema_json TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- HintTypeField: field definitions for hint type UI forms
CREATE TABLE IF NOT EXISTS hint_type_field (
    id TEXT PRIMARY KEY,
    hint_type_id TEXT NOT NULL REFERENCES hint_type(id) ON DELETE CASCADE,
    field_code TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('string', 'number', 'boolean', 'enum', 'color', 'image')),
    is_required INTEGER DEFAULT 0,
    default_value TEXT,
    options_json TEXT,
    sort_order INTEGER DEFAULT 0
);

-- RegionHint: a concrete hint attached to a region
CREATE TABLE IF NOT EXISTS region_hint (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL REFERENCES region(id) ON DELETE CASCADE,
    hint_type_id TEXT NOT NULL REFERENCES hint_type(id) ON DELETE RESTRICT,
    short_value TEXT,
    full_value TEXT,
    data_json TEXT,
    image_asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
    icon_asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    min_zoom REAL DEFAULT 0,
    max_zoom REAL DEFAULT 22,
    is_visible INTEGER DEFAULT 1,
    confidence REAL DEFAULT 1.0,
    source_note TEXT,
    created_by TEXT DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rh_region ON region_hint(region_id);
CREATE INDEX IF NOT EXISTS idx_rh_type ON region_hint(hint_type_id);
CREATE INDEX IF NOT EXISTS idx_rh_region_type ON region_hint(region_id, hint_type_id);
CREATE INDEX IF NOT EXISTS idx_rh_created_by ON region_hint(created_by);

-- Asset: metadata for image/icon files
CREATE TABLE IF NOT EXISTS asset (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('flag', 'sample', 'icon', 'thumbnail', 'photo')),
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    caption TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RevisionLog: audit trail for all mutations
CREATE TABLE IF NOT EXISTS revision_log (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    diff_json TEXT,
    created_by TEXT DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    comment TEXT
);

CREATE INDEX IF NOT EXISTS idx_revlog_entity ON revision_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_revlog_time ON revision_log(created_at);
CREATE INDEX IF NOT EXISTS idx_revlog_by ON revision_log(created_by);

-- AppSettings: key-value store for application state
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
