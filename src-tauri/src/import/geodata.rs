use geojson::{FeatureCollection, Value as GeoValue};
use rusqlite::Connection;
use uuid::Uuid;

/// Import countries from Natural Earth GeoJSON.
/// Returns the number of imported regions.
pub fn import_countries(conn: &Connection, geojson_str: &str) -> Result<usize, String> {
    let fc = parse_feature_collection(geojson_str, "countries")?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    let mut count = 0;
    for feature in &fc.features {
        let props = match &feature.properties {
            Some(p) => p,
            None => continue,
        };

        let name = prop_str(props, "NAME").unwrap_or("Unknown");
        let name_en = prop_str(props, "NAME_EN").or_else(|| prop_str(props, "NAME"));

        // Try ISO_A2, fall back to ISO_A2_EH
        let iso_a2 = resolve_iso_code(props, &["ISO_A2", "ISO_A2_EH"]);
        let iso_a2 = match iso_a2 {
            Some(code) => code,
            None => continue,
        };

        let (lng, lat) = centroid_from_feature(feature);

        tx.execute(
            "INSERT OR IGNORE INTO region (id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat)
             VALUES (?1, ?2, ?3, ?4, 'country', ?5, ?6, ?7)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                name,
                name_en,
                iso_a2,
                format!("countries:{}", iso_a2),
                lng,
                lat,
            ],
        )
        .map_err(|e| format!("Insert error: {}", e))?;
        count += 1;
    }

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;
    Ok(count)
}

/// Import admin1 regions from Natural Earth GeoJSON.
/// Returns the number of imported regions.
pub fn import_admin1(conn: &Connection, geojson_str: &str) -> Result<usize, String> {
    let fc = parse_feature_collection(geojson_str, "admin1")?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    let mut count = 0;
    for feature in &fc.features {
        let props = match &feature.properties {
            Some(p) => p,
            None => continue,
        };

        let name = prop_str(props, "name").unwrap_or("Unknown");
        let name_en = prop_str(props, "name_en").or_else(|| prop_str(props, "name"));
        let iso_a2 = match prop_str(props, "iso_a2") {
            Some(c) if !c.is_empty() && c != "-1" && c != "-99" => c,
            _ => continue,
        };

        let geometry_ref = prop_str(props, "iso_3166_2")
            .filter(|v| !v.is_empty() && *v != "-99")
            .or_else(|| prop_str(props, "adm1_code"))
            .map(|code| format!("admin1:{}", code))
            .unwrap_or_default();

        let parent_id: Option<String> = conn
            .query_row(
                "SELECT id FROM region WHERE country_code = ?1 AND region_level = 'country' LIMIT 1",
                [iso_a2],
                |row| row.get(0),
            )
            .ok();

        // Prefer explicit lat/lng from properties, fall back to centroid
        let lat = prop_f64(props, "latitude").unwrap_or(0.0);
        let lng = prop_f64(props, "longitude").unwrap_or(0.0);
        let (final_lng, final_lat) = if lng != 0.0 || lat != 0.0 {
            (lng, lat)
        } else {
            centroid_from_feature(feature)
        };

        tx.execute(
            "INSERT OR IGNORE INTO region (id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat)
             VALUES (?1, ?2, ?3, ?4, 'admin1', ?5, ?6, ?7, ?8)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                name,
                name_en,
                iso_a2,
                parent_id,
                geometry_ref,
                final_lng,
                final_lat,
            ],
        )
        .map_err(|e| format!("Insert error: {}", e))?;
        count += 1;
    }

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;
    Ok(count)
}

// ── Helpers ──────────────────────────────────────────────

fn parse_feature_collection(json: &str, label: &str) -> Result<FeatureCollection, String> {
    json.parse::<geojson::GeoJson>()
        .map_err(|e| format!("Failed to parse {} GeoJSON: {}", label, e))?
        .try_into()
        .map_err(|e| format!("Not a FeatureCollection: {}", e))
}

fn prop_str<'a>(props: &'a serde_json::Map<String, serde_json::Value>, key: &str) -> Option<&'a str> {
    props.get(key).and_then(|v| v.as_str())
}

fn prop_f64(props: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<f64> {
    props.get(key).and_then(|v| v.as_f64())
}

/// Try multiple property keys in order, returning the first valid ISO code.
fn resolve_iso_code<'a>(
    props: &'a serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a str> {
    for key in keys {
        if let Some(code) = prop_str(props, key) {
            if code != "-1" && code != "-99" {
                return Some(code);
            }
        }
    }
    None
}

/// Compute a simple centroid from a GeoJSON feature.
/// For MultiPolygon/Polygon, averages all exterior ring coordinates.
fn centroid_from_feature(feature: &geojson::Feature) -> (f64, f64) {
    let geometry = match &feature.geometry {
        Some(g) => g,
        None => return (0.0, 0.0),
    };

    let mut sum_lng = 0.0;
    let mut sum_lat = 0.0;
    let mut n = 0usize;

    match &geometry.value {
        GeoValue::Polygon(rings) => {
            if let Some(ring) = rings.first() {
                for coord in ring {
                    sum_lng += coord[0];
                    sum_lat += coord[1];
                    n += 1;
                }
            }
        }
        GeoValue::MultiPolygon(polygons) => {
            for rings in polygons {
                if let Some(ring) = rings.first() {
                    for coord in ring {
                        sum_lng += coord[0];
                        sum_lat += coord[1];
                        n += 1;
                    }
                }
            }
        }
        GeoValue::Point(coord) => return (coord[0], coord[1]),
        _ => {}
    }

    if n > 0 {
        (sum_lng / n as f64, sum_lat / n as f64)
    } else {
        (0.0, 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        db::migrations::run_all(&conn).unwrap();
        conn
    }

    #[test]
    fn test_import_countries_minimal() {
        let conn = test_conn();
        let geojson = r#"{
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"NAME": "Testland", "NAME_EN": "Testland", "ISO_A2": "TL"},
                "geometry": {"type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}
            }]
        }"#;

        let count = import_countries(&conn, geojson).unwrap();
        assert_eq!(count, 1);

        let name: String = conn
            .query_row(
                "SELECT name FROM region WHERE country_code = 'TL'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "Testland");
    }

    #[test]
    fn test_import_countries_fallback_iso() {
        let conn = test_conn();
        let geojson = r#"{
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"NAME": "Kosovo", "ISO_A2": "-99", "ISO_A2_EH": "XK"},
                "geometry": {"type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}
            }]
        }"#;

        let count = import_countries(&conn, geojson).unwrap();
        assert_eq!(count, 1);

        let code: String = conn
            .query_row("SELECT country_code FROM region LIMIT 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(code, "XK");
    }

    #[test]
    fn test_import_admin1_with_parent() {
        let conn = test_conn();

        let countries = r#"{
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"NAME": "Testland", "ISO_A2": "TL"},
                "geometry": {"type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}
            }]
        }"#;
        import_countries(&conn, countries).unwrap();

        let admin1 = r#"{
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"name": "Test Region", "name_en": "Test Region", "iso_a2": "TL", "iso_3166_2": "TL-TR", "latitude": 0.5, "longitude": 0.5, "adm1_code": "TLR"},
                "geometry": {"type": "Polygon", "coordinates": [[[0,0],[0.5,0],[0.5,0.5],[0,0.5],[0,0]]]}
            }]
        }"#;
        let count = import_admin1(&conn, admin1).unwrap();
        assert_eq!(count, 1);

        let parent_id: Option<String> = conn
            .query_row(
                "SELECT parent_id FROM region WHERE region_level = 'admin1' AND country_code = 'TL'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(parent_id.is_some());
    }
}
