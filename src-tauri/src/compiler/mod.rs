use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::UNIX_EPOCH;

const REGION_CODE_HINT_TYPE: &str = "region_code";
const REGION_CODE_COLOR: &str = "#0f766e";

#[derive(Clone)]
struct LayerCacheEntry {
    signature: String,
    geojson: String,
}

#[derive(Clone)]
struct RouteGeometryCacheEntry {
    signature: String,
    geometries: Arc<HashMap<String, Value>>,
}

fn point_layer_cache() -> &'static Mutex<HashMap<String, LayerCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, LayerCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn line_layer_cache() -> &'static Mutex<HashMap<String, LayerCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, LayerCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn route_geometry_cache() -> &'static Mutex<Option<RouteGeometryCacheEntry>> {
    static CACHE: OnceLock<Mutex<Option<RouteGeometryCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn cache_lookup(
    cache: &Mutex<HashMap<String, LayerCacheEntry>>,
    key: &str,
    signature: &str,
) -> Option<String> {
    let guard = cache.lock().ok()?;
    let entry = guard.get(key)?;
    if entry.signature == signature {
        Some(entry.geojson.clone())
    } else {
        None
    }
}

fn cache_store(
    cache: &Mutex<HashMap<String, LayerCacheEntry>>,
    key: &str,
    signature: &str,
    geojson: &str,
) {
    if let Ok(mut guard) = cache.lock() {
        guard.insert(
            key.to_string(),
            LayerCacheEntry {
                signature: signature.to_string(),
                geojson: geojson.to_string(),
            },
        );
    }
}

fn trailing_bracket_code(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if !trimmed.ends_with(']') {
        return None;
    }
    let end = trimmed.rfind(']')?;
    let start = trimmed[..end].rfind('[')?;
    let code = trimmed[start + 1..end].trim();
    if code.is_empty() {
        None
    } else {
        Some(code.to_string())
    }
}

fn leading_numeric_code(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let mut end = 0usize;
    for ch in trimmed.chars() {
        if ch.is_ascii_digit() {
            end += ch.len_utf8();
        } else {
            break;
        }
    }

    if end == 0 {
        return None;
    }

    let digits = &trimmed[..end];
    if !(2..=3).contains(&digits.len()) {
        return None;
    }

    Some(digits.to_string())
}

fn derive_region_code(
    region_level: &str,
    region_name_en: Option<&str>,
    geometry_ref: Option<&str>,
) -> Option<String> {
    if let Some(name_en) = region_name_en {
        if let Some(code) = leading_numeric_code(name_en) {
            return Some(code);
        }
        if let Some(code) = trailing_bracket_code(name_en) {
            return Some(code);
        }
    }

    if region_level == "admin1" {
        return geometry_ref
            .and_then(|value| value.strip_prefix("admin1:"))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
    }

    None
}

fn mix_signature_bytes(acc: &mut u64, bytes: &[u8]) {
    const FNV_PRIME: u64 = 1099511628211;
    for byte in bytes {
        *acc ^= *byte as u64;
        *acc = acc.wrapping_mul(FNV_PRIME);
    }
    // value separator
    *acc ^= 0xFF;
    *acc = acc.wrapping_mul(FNV_PRIME);
}

fn mix_signature_opt_str(acc: &mut u64, value: Option<&str>) {
    match value {
        Some(v) => mix_signature_bytes(acc, v.as_bytes()),
        None => mix_signature_bytes(acc, b"<null>"),
    }
}

fn region_code_layer_signature(conn: &Connection) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name_en, geometry_ref
             FROM region
             WHERE is_active = 1
               AND region_level = 'admin1'
             ORDER BY id",
        )
        .map_err(|e| e.to_string())?;

    let mut count: u64 = 0;
    let mut hash: u64 = 1469598103934665603; // FNV-1a offset basis

    for row in stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
    {
        let (id, name_en, geometry_ref) = row.map_err(|e| e.to_string())?;
        count = count.saturating_add(1);
        mix_signature_bytes(&mut hash, id.as_bytes());
        mix_signature_opt_str(&mut hash, name_en.as_deref());
        mix_signature_opt_str(&mut hash, geometry_ref.as_deref());
    }

    Ok(format!("{count}|{hash:016x}"))
}

fn point_layer_signature(conn: &Connection, hint_type_code: &str) -> Result<String, String> {
    if hint_type_code == REGION_CODE_HINT_TYPE {
        return region_code_layer_signature(conn);
    }

    let (
        count,
        max_updated,
        max_created,
        max_name_en,
        min_name_en,
        max_geometry_ref,
        max_region_id,
        min_region_id,
    ): (
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT COUNT(*),
                    MAX(rh.updated_at),
                    MAX(rh.created_at),
                    MAX(r.name_en),
                    MIN(r.name_en),
                    MAX(r.geometry_ref),
                    MAX(rh.region_id),
                    MIN(rh.region_id)
             FROM region_hint rh
             JOIN region r ON rh.region_id = r.id
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = ?1 AND rh.is_visible = 1 AND r.is_active = 1",
            [hint_type_code],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "{}|{}|{}|{}|{}|{}|{}|{}",
        count,
        max_updated.unwrap_or_default(),
        max_created.unwrap_or_default(),
        max_name_en.unwrap_or_default(),
        min_name_en.unwrap_or_default(),
        max_geometry_ref.unwrap_or_default(),
        max_region_id.unwrap_or_default(),
        min_region_id.unwrap_or_default()
    ))
}

fn route_file_signature(path: &Path) -> Result<String, String> {
    let metadata = std::fs::metadata(path).map_err(|e| {
        format!(
            "Failed to read routes metadata at {}: {}",
            path.display(),
            e
        )
    })?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Ok(format!(
        "{}|{}|{}",
        path.display(),
        metadata.len(),
        modified
    ))
}

fn line_layer_signature(conn: &Connection, hint_type_code: &str) -> Result<String, String> {
    let (count, max_updated, max_created): (i64, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT COUNT(*),
                    MAX(rh.updated_at),
                    MAX(rh.created_at)
             FROM region_hint rh
             JOIN region r ON rh.region_id = r.id
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = ?1
               AND rh.is_visible = 1
               AND r.is_active = 1
               AND r.region_level = 'route'",
            [hint_type_code],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let route_sig = route_file_signature(&resolve_routes_geojson_path(conn))?;
    Ok(format!(
        "{}|{}|{}|{}",
        count,
        max_updated.unwrap_or_default(),
        max_created.unwrap_or_default(),
        route_sig
    ))
}

fn compile_region_code_layer(conn: &Connection) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.anchor_lng, r.anchor_lat, r.name, r.name_en, r.country_code, r.region_level, r.geometry_ref
             FROM region r
             WHERE r.is_active = 1
               AND r.region_level = 'admin1'
               AND r.anchor_lng IS NOT NULL
               AND r.anchor_lat IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;

    let features: Vec<Value> = stmt
        .query_map([], |row| {
            let region_id: String = row.get(0)?;
            let lng: f64 = row.get(1)?;
            let lat: f64 = row.get(2)?;
            let region_name_native: String = row.get(3)?;
            let region_name_en: Option<String> = row.get(4)?;
            let country_code: Option<String> = row.get(5)?;
            let region_level: String = row.get(6)?;
            let geometry_ref: Option<String> = row.get(7)?;

            let region_code = derive_region_code(
                &region_level,
                region_name_en.as_deref(),
                geometry_ref.as_deref(),
            );

            Ok((
                region_id,
                lng,
                lat,
                region_name_native,
                region_name_en,
                country_code,
                region_level,
                region_code,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(
            |(
                region_id,
                lng,
                lat,
                region_name_native,
                region_name_en,
                country_code,
                region_level,
                region_code,
            )| {
                let code = region_code?;
                let region_name = region_name_en.unwrap_or(region_name_native);

                let mut properties = serde_json::Map::new();
                properties.insert("id".into(), json!(format!("region_code:{region_id}")));
                properties.insert("region_id".into(), json!(region_id));
                properties.insert("region_level".into(), json!(region_level));
                properties.insert("region_name".into(), json!(region_name));
                properties.insert("country_code".into(), json!(country_code));
                properties.insert("short_value".into(), json!(code));
                properties.insert("full_value".into(), json!("Regional code"));
                properties.insert("color".into(), json!(REGION_CODE_COLOR));
                properties.insert("min_zoom".into(), json!(2.0));
                properties.insert("max_zoom".into(), json!(10.0));
                properties.insert("confidence".into(), json!(1.0));
                properties.insert("region_code".into(), json!(code));
                properties.insert("source_note".into(), json!("system:region_code"));

                Some(json!({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lng, lat]
                    },
                    "properties": properties
                }))
            },
        )
        .collect();

    let fc = json!({
        "type": "FeatureCollection",
        "features": features
    });
    serde_json::to_string(&fc).map_err(|e| e.to_string())
}

/// Compile point GeoJSON for a given hint_type code.
/// Joins region_hint with region to get anchor coordinates.
/// Returns a GeoJSON FeatureCollection string.
pub fn compile_point_layer(conn: &Connection, hint_type_code: &str) -> Result<String, String> {
    let signature = point_layer_signature(conn, hint_type_code)?;
    if let Some(cached) = cache_lookup(point_layer_cache(), hint_type_code, &signature) {
        return Ok(cached);
    }

    let geojson = if hint_type_code == REGION_CODE_HINT_TYPE {
        compile_region_code_layer(conn)?
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT rh.id, rh.short_value, rh.full_value, rh.data_json, rh.color,
                        rh.min_zoom, rh.max_zoom, rh.confidence,
                        r.anchor_lng, r.anchor_lat, r.name, r.name_en, r.country_code, r.id as region_id, r.region_level, r.geometry_ref,
                        rh.image_asset_id, rh.icon_asset_id, rh.source_note
                 FROM region_hint rh
                 JOIN region r ON rh.region_id = r.id
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 WHERE ht.code = ?1 AND rh.is_visible = 1 AND r.is_active = 1",
            )
            .map_err(|e| e.to_string())?;

        let features: Vec<Value> = stmt
            .query_map([hint_type_code], |row| {
                let lng: f64 = row.get(8)?;
                let lat: f64 = row.get(9)?;
                let id: String = row.get(0)?;
                let short_value: Option<String> = row.get(1)?;
                let full_value: Option<String> = row.get(2)?;
                let data_json: Option<String> = row.get(3)?;
                let color: Option<String> = row.get(4)?;
                let min_zoom: f64 = row.get(5)?;
                let max_zoom: f64 = row.get(6)?;
                let confidence: f64 = row.get(7)?;
                let region_name_native: String = row.get(10)?;
                let region_name_en: Option<String> = row.get(11)?;
                let country_code: Option<String> = row.get(12)?;
                let region_id: String = row.get(13)?;
                let region_level: String = row.get(14)?;
                let geometry_ref: Option<String> = row.get(15)?;
                let image_asset_id: Option<String> = row.get(16)?;
                let icon_asset_id: Option<String> = row.get(17)?;
                let source_note: Option<String> = row.get(18)?;

                let region_name = region_name_en.clone().unwrap_or(region_name_native);
                let region_code = derive_region_code(
                    &region_level,
                    region_name_en.as_deref(),
                    geometry_ref.as_deref(),
                );

                let mut properties = serde_json::Map::new();
                properties.insert("id".into(), json!(id));
                properties.insert("region_id".into(), json!(region_id));
                properties.insert("region_level".into(), json!(region_level));
                properties.insert("region_name".into(), json!(region_name));
                properties.insert("country_code".into(), json!(country_code));
                properties.insert("short_value".into(), json!(short_value));
                properties.insert("full_value".into(), json!(full_value));
                properties.insert("color".into(), json!(color));
                properties.insert("min_zoom".into(), json!(min_zoom));
                properties.insert("max_zoom".into(), json!(max_zoom));
                properties.insert("confidence".into(), json!(confidence));
                properties.insert("image_asset_id".into(), json!(image_asset_id));
                properties.insert("icon_asset_id".into(), json!(icon_asset_id));
                properties.insert("source_note".into(), json!(source_note));

                // Flatten data_json into properties
                if let Some(dj) = data_json {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Map<String, Value>>(&dj)
                    {
                        for (k, v) in parsed {
                            properties.insert(k, v);
                        }
                    }
                }

                if !properties.contains_key("region_code") {
                    if let Some(code) = region_code {
                        properties.insert("region_code".into(), json!(code));
                    }
                }

                Ok(json!({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lng, lat]
                    },
                    "properties": properties
                }))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let fc = json!({
            "type": "FeatureCollection",
            "features": features
        });

        serde_json::to_string(&fc).map_err(|e| e.to_string())?
    };

    cache_store(point_layer_cache(), hint_type_code, &signature, &geojson);
    Ok(geojson)
}

/// Compile polygon enrichment data for a given hint_type code.
/// Returns a map of country_code → hint properties (for polygon_fill types).
pub fn compile_polygon_enrichment(
    conn: &Connection,
    hint_type_code: &str,
) -> Result<HashMap<String, Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT r.country_code, rh.short_value, rh.data_json, rh.color
             FROM region_hint rh
             JOIN region r ON rh.region_id = r.id
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = ?1 AND rh.is_visible = 1 AND r.region_level = 'country'",
        )
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();

    stmt.query_map([hint_type_code], |row| {
        let cc: String = row.get(0)?;
        let short_value: Option<String> = row.get(1)?;
        let data_json: Option<String> = row.get(2)?;
        let color: Option<String> = row.get(3)?;

        let mut props = serde_json::Map::new();
        props.insert("short_value".into(), json!(short_value));
        props.insert("color".into(), json!(color));

        if let Some(dj) = data_json {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Map<String, Value>>(&dj) {
                for (k, v) in parsed {
                    props.insert(k, v);
                }
            }
        }

        Ok((cc, Value::Object(props)))
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .for_each(|(cc, v)| {
        map.insert(cc, v);
    });

    Ok(map)
}

/// Compile line GeoJSON for a given hint_type code.
/// Uses route geometries referenced by region.geometry_ref = "routes:<route_id>".
pub fn compile_line_layer(conn: &Connection, hint_type_code: &str) -> Result<String, String> {
    let signature = line_layer_signature(conn, hint_type_code)?;
    if let Some(cached) = cache_lookup(line_layer_cache(), hint_type_code, &signature) {
        return Ok(cached);
    }

    let route_geometries = load_route_geometry_map(conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.short_value, rh.full_value, rh.data_json, rh.color,
                    rh.min_zoom, rh.max_zoom, rh.confidence,
                    r.id as region_id, r.name, r.country_code, r.geometry_ref
             FROM region_hint rh
             JOIN region r ON rh.region_id = r.id
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = ?1
               AND rh.is_visible = 1
               AND r.is_active = 1
               AND r.region_level = 'route'",
        )
        .map_err(|e| e.to_string())?;

    let features: Vec<Value> = stmt
        .query_map([hint_type_code], |row| {
            let hint_id: String = row.get(0)?;
            let short_value: Option<String> = row.get(1)?;
            let full_value: Option<String> = row.get(2)?;
            let data_json: Option<String> = row.get(3)?;
            let color: Option<String> = row.get(4)?;
            let min_zoom: f64 = row.get(5)?;
            let max_zoom: f64 = row.get(6)?;
            let confidence: f64 = row.get(7)?;
            let region_id: String = row.get(8)?;
            let region_name: String = row.get(9)?;
            let country_code: Option<String> = row.get(10)?;
            let geometry_ref: Option<String> = row.get(11)?;

            Ok((
                hint_id,
                short_value,
                full_value,
                data_json,
                color,
                min_zoom,
                max_zoom,
                confidence,
                region_id,
                region_name,
                country_code,
                geometry_ref,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(
            |(
                hint_id,
                short_value,
                full_value,
                data_json,
                color,
                min_zoom,
                max_zoom,
                confidence,
                region_id,
                region_name,
                country_code,
                geometry_ref,
            )| {
                let route_id = geometry_ref
                    .as_deref()
                    .and_then(|g| g.strip_prefix("routes:"))
                    .map(|s| s.to_string())?;
                let geometry = route_geometries.get(&route_id)?.clone();

                let mut properties = serde_json::Map::new();
                properties.insert("id".into(), json!(hint_id));
                properties.insert("region_id".into(), json!(region_id));
                properties.insert("region_name".into(), json!(region_name));
                properties.insert("country_code".into(), json!(country_code));
                properties.insert("short_value".into(), json!(short_value));
                properties.insert("full_value".into(), json!(full_value));
                properties.insert("color".into(), json!(color));
                properties.insert("min_zoom".into(), json!(min_zoom));
                properties.insert("max_zoom".into(), json!(max_zoom));
                properties.insert("confidence".into(), json!(confidence));
                properties.insert("route_id".into(), json!(route_id));

                if let Some(dj) = data_json {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Map<String, Value>>(&dj)
                    {
                        for (k, v) in parsed {
                            properties.insert(k, v);
                        }
                    }
                }

                Some(json!({
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": properties
                }))
            },
        )
        .collect();

    let fc = json!({
        "type": "FeatureCollection",
        "features": features
    });

    let geojson = serde_json::to_string(&fc).map_err(|e| e.to_string())?;
    cache_store(line_layer_cache(), hint_type_code, &signature, &geojson);
    Ok(geojson)
}

fn load_route_geometry_map(conn: &Connection) -> Result<Arc<HashMap<String, Value>>, String> {
    let routes_path = resolve_routes_geojson_path(conn);
    let signature = route_file_signature(&routes_path)?;

    if let Ok(cache_guard) = route_geometry_cache().lock() {
        if let Some(entry) = cache_guard.as_ref() {
            if entry.signature == signature {
                return Ok(Arc::clone(&entry.geometries));
            }
        }
    }

    let json_str = std::fs::read_to_string(&routes_path).map_err(|e| {
        format!(
            "Failed to read routes GeoJSON at {}: {}",
            routes_path.display(),
            e
        )
    })?;

    let fc: geojson::FeatureCollection = json_str
        .parse::<geojson::GeoJson>()
        .map_err(|e| format!("Failed to parse routes GeoJSON: {}", e))?
        .try_into()
        .map_err(|e| format!("Routes file is not a FeatureCollection: {}", e))?;

    let mut map = HashMap::new();
    for feature in fc.features {
        let route_id = feature
            .properties
            .as_ref()
            .and_then(|p| p.get("route_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let geometry = feature
            .geometry
            .as_ref()
            .and_then(|g| geometry_value_to_geojson(&g.value));

        if let (Some(route_id), Some(geometry)) = (route_id, geometry) {
            map.insert(route_id, geometry);
        }
    }

    let geometries = Arc::new(map);
    if let Ok(mut cache_guard) = route_geometry_cache().lock() {
        *cache_guard = Some(RouteGeometryCacheEntry {
            signature,
            geometries: Arc::clone(&geometries),
        });
    }

    Ok(geometries)
}

fn resolve_routes_geojson_path(conn: &Connection) -> PathBuf {
    // First try app setting written at startup.
    if let Some(dir) = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'geodata.dir'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
    {
        let path = PathBuf::from(dir).join("routes.geojson");
        if path.exists() {
            return path;
        }
    }

    // Dev path
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("assets")
        .join("geodata")
        .join("routes.geojson");
    if dev.exists() {
        return dev;
    }

    // Fallback relative path
    PathBuf::from("assets")
        .join("geodata")
        .join("routes.geojson")
}

fn geometry_value_to_geojson(value: &geojson::Value) -> Option<Value> {
    match value {
        geojson::Value::LineString(coords) => Some(json!({
            "type": "LineString",
            "coordinates": coords,
        })),
        geojson::Value::MultiLineString(lines) => Some(json!({
            "type": "MultiLineString",
            "coordinates": lines,
        })),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> Connection {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.into_inner().unwrap();

        crate::seed::hint_types::seed(&conn).unwrap();

        // Add test countries
        let geojson = r#"{
            "type": "FeatureCollection",
            "features": [
                {"type":"Feature","properties":{"NAME":"UK","ISO_A2":"GB"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}},
                {"type":"Feature","properties":{"NAME":"France","ISO_A2":"FR"},"geometry":{"type":"Polygon","coordinates":[[[2,2],[3,2],[3,3],[2,2]]]}}
            ]
        }"#;
        crate::import::geodata::import_countries(&conn, geojson).unwrap();
        crate::seed::driving_side::seed(&conn).unwrap();
        crate::seed::flags::seed(&conn).unwrap();

        conn
    }

    #[test]
    fn test_compile_point_layer_flags() {
        let conn = setup_db();
        let geojson_str = compile_point_layer(&conn, "flag").unwrap();
        let fc: Value = serde_json::from_str(&geojson_str).unwrap();

        let features = fc["features"].as_array().unwrap();
        assert_eq!(features.len(), 2);

        // Check first feature has coordinates and properties
        let f = &features[0];
        assert_eq!(f["geometry"]["type"], "Point");
        assert!(f["geometry"]["coordinates"][0].as_f64().is_some());
        assert!(f["properties"]["short_value"].as_str().is_some());
        assert!(f["properties"]["region_name"].as_str().is_some());
    }

    #[test]
    fn test_compile_point_layer_derives_admin1_region_code() {
        let conn = setup_db();

        let hint_type_id: String = conn
            .query_row(
                "SELECT id FROM hint_type WHERE code = 'phone_hint' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let country_id: String = conn
            .query_row(
                "SELECT id FROM region WHERE country_code = 'GB' AND region_level = 'country' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        conn.execute(
            "INSERT INTO region (id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat)
             VALUES ('admin1-gb-lan', 'Lancashire', 'Lancashire [LAN]', 'GB', 'admin1', ?1, 'admin1:GB-LAN', -2.7, 53.8)",
            rusqlite::params![country_id],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO region_hint (id, region_id, hint_type_id, short_value, full_value, color, is_visible)
             VALUES ('hint-admin1-gb-lan', 'admin1-gb-lan', ?1, '+44 1524', 'Lancashire dialing area', '#0ea5e9', 1)",
            rusqlite::params![hint_type_id],
        )
        .unwrap();

        let geojson_str = compile_point_layer(&conn, "phone_hint").unwrap();
        let fc: Value = serde_json::from_str(&geojson_str).unwrap();
        let features = fc["features"].as_array().unwrap();
        let feature = features
            .iter()
            .find(|f| f["properties"]["region_id"] == "admin1-gb-lan")
            .expect("admin1 feature missing");

        assert_eq!(feature["properties"]["region_code"], "LAN");
        assert_eq!(feature["properties"]["region_name"], "Lancashire [LAN]");
    }

    #[test]
    fn test_compile_point_layer_region_code_virtual_type() {
        let conn = setup_db();
        let country_id: String = conn
            .query_row(
                "SELECT id FROM region WHERE country_code = 'GB' AND region_level = 'country' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        conn.execute(
            "INSERT INTO region (id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat)
             VALUES ('admin1-gb-wes', 'West Midlands', 'West Midlands [WM]', 'GB', 'admin1', ?1, 'admin1:GB-WM', -1.9, 52.5)",
            rusqlite::params![country_id],
        )
        .unwrap();

        let geojson_str = compile_point_layer(&conn, "region_code").unwrap();
        let fc: Value = serde_json::from_str(&geojson_str).unwrap();
        let features = fc["features"].as_array().unwrap();
        let feature = features
            .iter()
            .find(|f| f["properties"]["region_id"] == "admin1-gb-wes")
            .expect("virtual region_code feature missing");

        assert_eq!(feature["properties"]["short_value"], "WM");
        assert_eq!(feature["properties"]["region_code"], "WM");
        assert_eq!(feature["properties"]["source_note"], "system:region_code");
    }

    #[test]
    fn test_compile_polygon_enrichment_driving_side() {
        let conn = setup_db();
        let map = compile_polygon_enrichment(&conn, "driving_side").unwrap();

        assert_eq!(map.len(), 2);
        assert_eq!(map["GB"]["side"], "left");
        assert_eq!(map["FR"]["side"], "right");
    }

    #[test]
    fn test_compile_line_layer_highway() {
        let conn = setup_db();

        // Register geodata path in app_settings for compiler path resolution.
        let routes_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("assets")
            .join("geodata");
        crate::db::settings::set(&conn, "geodata.dir", &routes_dir.to_string_lossy()).unwrap();

        let route_id = "us-i10";
        let region_id = format!("route:{}", route_id);
        let hint_id = format!("route_hint:{}", route_id);
        let hint_type_id: String = conn
            .query_row(
                "SELECT id FROM hint_type WHERE code = 'highway' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        conn.execute(
            "INSERT INTO region (id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat)
             VALUES (?1, 'Interstate 10', 'Interstate 10', 'US', 'route', ?2, -100.0, 30.0)",
            rusqlite::params![region_id, format!("routes:{}", route_id)],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO region_hint (id, region_id, hint_type_id, short_value, full_value, data_json, color, is_visible)
             VALUES (?1, ?2, ?3, 'I-10', 'Interstate 10', ?4, '#E31937', 1)",
            rusqlite::params![
                hint_id,
                format!("route:{}", route_id),
                hint_type_id,
                r#"{"route_system":"us_interstate","route_number":"I-10"}"#
            ],
        )
        .unwrap();

        let geojson_str = compile_line_layer(&conn, "highway").unwrap();
        let fc: Value = serde_json::from_str(&geojson_str).unwrap();
        let features = fc["features"].as_array().unwrap();
        assert!(!features.is_empty());
        assert_eq!(features[0]["geometry"]["type"], "LineString");
        assert_eq!(features[0]["properties"]["route_number"], "I-10");
    }

    #[test]
    fn test_derive_region_code_helpers() {
        assert_eq!(
            trailing_bracket_code("California [CA]").as_deref(),
            Some("CA")
        );
        assert_eq!(
            leading_numeric_code("01 Republic of Adygea [AD]").as_deref(),
            Some("01")
        );
        assert_eq!(
            derive_region_code(
                "admin1",
                Some("01 Republic of Adygea [AD]"),
                Some("admin1:RU-AD")
            )
            .as_deref(),
            Some("01")
        );
        assert_eq!(
            derive_region_code("admin1", Some("Kerala [KL]"), Some("admin1:IN-KL")).as_deref(),
            Some("KL")
        );
        assert_eq!(
            derive_region_code("admin1", None, Some("admin1:US-CA")).as_deref(),
            Some("US-CA")
        );
        assert_eq!(derive_region_code("country", Some("France"), None), None);
    }
}
