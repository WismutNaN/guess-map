use rusqlite::Connection;
use serde_json::{json, Value};

/// Compile point GeoJSON for a given hint_type code.
/// Joins region_hint with region to get anchor coordinates.
/// Returns a GeoJSON FeatureCollection string.
pub fn compile_point_layer(conn: &Connection, hint_type_code: &str) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.short_value, rh.full_value, rh.data_json, rh.color,
                    rh.min_zoom, rh.max_zoom, rh.confidence,
                    r.anchor_lng, r.anchor_lat, r.name, r.country_code, r.id as region_id,
                    rh.icon_asset_id
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
            let icon_asset_id: Option<String> = row.get(13)?;

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
            properties.insert("icon_asset_id".into(), json!(icon_asset_id));

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
) -> Result<std::collections::HashMap<String, Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT r.country_code, rh.short_value, rh.data_json, rh.color
             FROM region_hint rh
             JOIN region r ON rh.region_id = r.id
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = ?1 AND rh.is_visible = 1 AND r.region_level = 'country'",
        )
        .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();

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
}
