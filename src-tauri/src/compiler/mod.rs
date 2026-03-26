use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

/// Compile point GeoJSON for a given hint_type code.
/// Joins region_hint with region to get anchor coordinates.
/// Returns a GeoJSON FeatureCollection string.
pub fn compile_point_layer(conn: &Connection, hint_type_code: &str) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.short_value, rh.full_value, rh.data_json, rh.color,
                    rh.min_zoom, rh.max_zoom, rh.confidence,
                    r.anchor_lng, r.anchor_lat, r.name, r.country_code, r.id as region_id,
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
            let region_name: String = row.get(10)?;
            let country_code: Option<String> = row.get(11)?;
            let region_id: String = row.get(12)?;
            let image_asset_id: Option<String> = row.get(13)?;
            let icon_asset_id: Option<String> = row.get(14)?;
            let source_note: Option<String> = row.get(15)?;

            let mut properties = serde_json::Map::new();
            properties.insert("id".into(), json!(id));
            properties.insert("region_id".into(), json!(region_id));
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
                if let Ok(parsed) = serde_json::from_str::<serde_json::Map<String, Value>>(&dj) {
                    for (k, v) in parsed {
                        properties.insert(k, v);
                    }
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

    serde_json::to_string(&fc).map_err(|e| e.to_string())
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

    serde_json::to_string(&fc).map_err(|e| e.to_string())
}

fn load_route_geometry_map(conn: &Connection) -> Result<HashMap<String, Value>, String> {
    let routes_path = resolve_routes_geojson_path(conn);
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

    Ok(map)
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
}
