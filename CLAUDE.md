# GuessMap — Project Instructions

## Overview

GuessMap is a Tauri 2 + React + MapLibre desktop app for GeoGuessr training.
It stores geographic hints (road signs, poles, scripts, driving sides, etc.) tied to regions (countries, admin1 subdivisions) and displays them on an interactive map.

## Tech Stack

- **Backend**: Rust (Tauri 2), SQLite, Axum (Agent API)
- **Frontend**: React + TypeScript, MapLibre GL JS, Leaflet (coverage overlay)
- **Build**: Vite, Cargo

## Key Directories

```
src/                  # React frontend
src-tauri/src/        # Rust backend
  commands/           # Tauri IPC commands (hints, regions, assets)
  agent/              # HTTP Agent API (Axum server)
  compiler/           # GeoJSON compilation from SQLite
  seed/               # Built-in data (hint types, driving sides)
  import/             # Natural Earth & route data import
  db/                 # SQLite connection, migrations, settings
docs/                 # Architecture docs, PLAN.md
scripts/              # CLI tools
```

## Agent API — Populating the Database

GuessMap has a built-in HTTP API for programmatic data entry. Use it to populate hints from external sources.

### Prerequisites

1. GuessMap must be running (`npx tauri dev`)
2. Agent API must be enabled in Settings > Agent API
3. Set environment variables:

```bash
export GM_API_TOKEN="<token from Settings>"
export GM_API_PORT=21345   # default
```

### CLI Tool: `scripts/gm-agent.mjs`

A Node.js CLI wrapper around the Agent API. All commands output JSON.

```bash
# Check connectivity
node scripts/gm-agent.mjs health

# View database stats
node scripts/gm-agent.mjs stats

# List all hint types (see available types, their schemas, display families)
node scripts/gm-agent.mjs hint-types

# Search regions
node scripts/gm-agent.mjs regions --country DE --level admin1
node scripts/gm-agent.mjs regions --search "Bavaria"

# Get region details with existing hints
node scripts/gm-agent.mjs region <region-id>

# Upload an image from local file
node scripts/gm-agent.mjs upload-asset path/to/image.png --kind sample --caption "German stop sign"

# Upload an image from URL
node scripts/gm-agent.mjs upload-asset-url "https://example.com/sign.jpg" --kind sample --caption "Speed limit sign"

# Create a single hint
node scripts/gm-agent.mjs create-hint '{"region_id":"country-de","hint_type_code":"sign","short_value":"Stop sign","image_asset_id":"<asset-id>","source_note":"https://example.com"}'

# Create hints for all admin1 regions of a country
node scripts/gm-agent.mjs by-country '{"country_code":"DE","region_level":"admin1","hint_type_code":"driving_side","short_value":"Right","data_json":{"side":"right"},"color":"#AA0000"}'

# Fill country domain hints (.ru, .uk, ...)
node scripts/gm-agent.mjs fill-country-domains
node scripts/gm-agent.mjs fill-country-domains --country GB --force

# Batch create hints (JSON file or string)
node scripts/gm-agent.mjs batch-hints hints.json

# Recompile map layers after data changes
node scripts/gm-agent.mjs compile driving_side,flag

# Delete a hint
node scripts/gm-agent.mjs delete-hint <hint-id>
```

### Hint Types Reference

| Code | Display Family | Schema Fields | Purpose |
|------|---------------|---------------|---------|
| `flag` | icon | — | Country flag |
| `driving_side` | polygon_fill | `side`: left/right/mixed | Driving side |
| `script_sample` | image | — | Script/alphabet sample |
| `phone_hint` | text | `prefix`, `format` | Phone number format |
| `country_domain` | text | `tld`, `country_code` | Country ccTLD/domain (`.ru`, `.uk`, ...) |
| `road_marking` | image | `marking_type` | Road marking style |
| `sign` | image | `sign_type` | Road signs |
| `pole` | image | `material`, `color` | Utility poles |
| `bollard` | image | `bollard_type` | Bollards |
| `coverage` | polygon_fill | `provider`, `year` | Street View coverage |
| `camera_meta` | text | `generation`, `has_blur` | Camera metadata |
| `car_type` | icon | `brand`, `model`, `color` | Survey car type |
| `vegetation` | icon | `biome`, `key_species` | Vegetation type |
| `note` | text | — | Free-form note |
| `camera_generation` | polygon_fill | `generation`: gen1-gen4/mixed/unknown | Camera generation |
| `highway` | line | `route_system`, `route_number`, `direction` | Highway/route |

### Layering Policy

- Every repeatable fact type must use its own `hint_type` (separate toggle/layer in UI).
- Do **not** store structured, repeatable datasets in `note`.
- `note` is only for one-off free-form comments.
- If no matching `hint_type` exists for a repeatable dataset, add a new `hint_type` first, then import data.

### Workflow: Populating Hints from Web Sources

When given a task with a URL or topic:

1. **Fetch the source** — use WebFetch to get the page content
2. **Extract information** — identify region-specific features (images, text descriptions)
3. **Find target regions** — use `regions --search` or `regions --country XX` to find region IDs
4. **Upload images** — use `upload-asset-url` for each image found
5. **Create hints** — use `create-hint` or `batch-hints` with the uploaded asset IDs
6. **Compile layers** — call `compile` to refresh the map display
7. **Always set `source_note`** — include the source URL for attribution

### API Endpoints (Direct HTTP)

If you need more control than the CLI provides:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Database statistics |
| GET | `/api/hint-types` | List hint types with JSON schemas |
| GET | `/api/regions?country_code=XX&region_level=admin1&search=Q&limit=N&offset=N` | Query regions |
| GET | `/api/regions/{id}` | Region + hints |
| GET | `/api/regions/{id}/hints` | Hints for region |
| POST | `/api/hints` | Create hint |
| POST | `/api/hints/batch` | Batch create (up to 10,000) |
| POST | `/api/hints/by-country` | Create for all regions of country/level |
| PUT | `/api/hints/{id}` | Update hint |
| DELETE | `/api/hints/{id}` | Delete hint |
| POST | `/api/assets` | Upload image (base64) |
| GET | `/api/assets/{id}` | Asset metadata |
| POST | `/api/layers/compile` | Recompile layers |
| GET | `/api/schema` | OpenAPI stub |

All requests require `Authorization: Bearer <token>` header.

### Asset Upload Format (POST /api/assets)

```json
{
  "file_name": "sign_de_01.png",
  "data": "<base64-encoded-image-bytes>",
  "kind": "sample",
  "caption": "German speed limit sign"
}
```

Kind values: `flag`, `sample`, `icon`, `thumbnail`, `photo`.

### Create Hint Format (POST /api/hints)

```json
{
  "region_id": "country-de",
  "hint_type_code": "sign",
  "short_value": "Speed limit sign",
  "full_value": "Round white sign with red border, number in center",
  "data_json": { "sign_type": "speed_limit" },
  "color": "#CC0000",
  "confidence": 0.9,
  "image_asset_id": "<uuid from upload>",
  "source_note": "https://example.com/source-page"
}
```

Optional fields default to: `confidence=1.0`, `min_zoom=0`, `max_zoom=22`, `is_visible=true`.

## Build Commands

```bash
npx tauri dev          # Dev mode with hot reload
npm run build          # Frontend build check
cd src-tauri && cargo test   # Rust tests
npm test               # Frontend tests
```

## Important Notes

- The app uses a corporate VPN with SSL inspection — direct HTTPS to external services may fail
- Windows platform — use native-tls, not rustls
- MapLibre uses WebGL — cross-origin images require CORS headers
- Coverage overlay uses Leaflet (not MapLibre) to bypass CORS for Google tiles
