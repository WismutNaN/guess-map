-- Migration 002: Add 'line' display_family and 'route' region_level
--
-- SQLite does not support ALTER CHECK CONSTRAINT, so we recreate the tables
-- with the new constraints while preserving data.
-- Uses DROP IF EXISTS for idempotency (safe to re-run if partially applied).

PRAGMA foreign_keys=OFF;

-- Step 1: Recreate hint_type with expanded display_family
DROP TABLE IF EXISTS hint_type_new;
CREATE TABLE hint_type_new (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    display_family TEXT NOT NULL CHECK (display_family IN ('polygon_fill', 'icon', 'text', 'image', 'composite', 'line')),
    default_icon TEXT,
    schema_json TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO hint_type_new SELECT * FROM hint_type;
DROP TABLE hint_type;
ALTER TABLE hint_type_new RENAME TO hint_type;

-- Step 2: Recreate region with expanded region_level
DROP TABLE IF EXISTS region_new;
CREATE TABLE region_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    country_code TEXT,
    region_level TEXT NOT NULL CHECK (region_level IN ('country', 'admin1', 'admin2', 'theme_region', 'route')),
    parent_id TEXT REFERENCES region_new(id) ON DELETE SET NULL,
    geometry_ref TEXT,
    anchor_lng REAL,
    anchor_lat REAL,
    anchor_offset_x REAL DEFAULT 0,
    anchor_offset_y REAL DEFAULT 0,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO region_new SELECT * FROM region;
DROP TABLE region;
ALTER TABLE region_new RENAME TO region;

CREATE INDEX IF NOT EXISTS idx_region_country ON region(country_code);
CREATE INDEX IF NOT EXISTS idx_region_level ON region(region_level);
CREATE INDEX IF NOT EXISTS idx_region_parent ON region(parent_id);
CREATE INDEX IF NOT EXISTS idx_region_name ON region(name);
CREATE INDEX IF NOT EXISTS idx_region_name_en ON region(name_en);

PRAGMA foreign_keys=ON;
