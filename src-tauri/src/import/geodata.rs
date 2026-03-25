use geojson::{FeatureCollection, Value as GeoValue};
use rusqlite::Connection;
use uuid::Uuid;

/// Import countries from Natural Earth GeoJSON.
/// Returns the number of imported regions.
pub fn import_countries(conn: &Connection, geojson_str: &str) -> Result<usize, String> {
    let fc: FeatureCollection = geojson_str
        .parse::<geojson::GeoJson>()
        .map_err(|e| format!("Failed to parse countries GeoJSON: {}", e))?
        .try_into()
        .map_err(|e| format!("Not a FeatureCollection: {}", e))?;

    let mut count = 0;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    for feature in &fc.features {
        let props = match &feature.properties {
            Some(p) => p,
            None => continue,
        };

        let name = props
            .get("NAME")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        let name_en = props
            .get("NAME_EN")
            .and_then(|v| v.as_str())
            .or_else(|| props.get("NAME").and_then(|v| v.as_str()));

        let iso_a2 = props
            .get("ISO_A2")
            .and_then(|v| v.as_str())
            .unwrap_or("-1");

        // Skip features without valid ISO code
        if iso_a2 == "-1" || iso_a2 == "-99" {
            // Try ISO_A2_EH as fallback
            let iso_a2_eh = props
                .get("ISO_A2_EH")
                .and_then(|v| v.as_str())
                .unwrap_or("-1");
            if iso_a2_eh == "-1" || iso_a2_eh == "-99" {
                continue;
            }
            let (lng, lat) = centroid_from_feature(feature);
            let geometry_ref = format!("countries:{}", iso_a2_eh);

            tx.execute(
                "INSERT OR IGNORE INTO region (id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat)
                 VALUES (?1, ?2, ?3, ?4, 'country', ?5, ?6, ?7)",
                rusqlite::params![
                    Uuid::new_v4().to_string(),
                    name,
                    name_en,
                    iso_a2_eh,
                    geometry_ref,
                    lng,
                    lat
                ],
            ).map_err(|e| format!("Insert error: {}", e))?;
            count += 1;
            continue;
        }

        let (lng, lat) = centroid_from_feature(feature);
        let geometry_ref = format!("countries:{}", iso_a2);

        tx.execute(
            "INSERT OR IGNORE INTO region (id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat)
             VALUES (?1, ?2, ?3, ?4, 'country', ?5, ?6, ?7)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                name,
                name_en,
                iso_a2,
                geometry_ref,
                lng,
                lat
            ],
        ).map_err(|e| format!("Insert error: {}", e))?;

        count += 1;
    }

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;
    Ok(count)
}

/// Import admin1 regions from Natural Earth GeoJSON.
/// Returns the number of imported regions.
pub fn import_admin1(conn: &Connection, geojson_str: &str) -> Result<usize, String> {
    let fc: FeatureCollection = geojson_str
        .parse::<geojson::GeoJson>()
        .map_err(|e| format!("Failed to parse admin1 GeoJSON: {}", e))?
        .try_into()
        .map_err(|e| format!("Not a FeatureCollection: {}", e))?;

    let mut count = 0;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    for feature in &fc.features {
        let props = match &feature.properties {
            Some(p) => p,
            None => continue,
        };

        let name = props
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        let name_en = props
            .get("name_en")
            .and_then(|v| v.as_str())
            .or_else(|| props.get("name").and_then(|v| v.as_str()));

        let iso_a2 = props
            .get("iso_a2")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if iso_a2.is_empty() || iso_a2 == "-1" || iso_a2 == "-99" {
            continue;
        }

        let iso_3166_2 = props
            .get("iso_3166_2")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let geometry_ref = if !iso_3166_2.is_empty() && iso_3166_2 != "-99" {
            format!("admin1:{}", iso_3166_2)
        } else {
            let adm1_code = props
                .get("adm1_code")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("admin1:{}", adm1_code)
        };

        // Find parent country
        let parent_id: Option<String> = conn
            .query_row(
                "SELECT id FROM region WHERE country_code = ?1 AND region_level = 'country' LIMIT 1",
                [iso_a2],
                |row| row.get(0),
            )
            .ok();

        let lat = props
            .get("latitude")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let lng = props
            .get("longitude")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        // Use provided lat/lng if available, otherwise compute centroid
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
                final_lat
            ],
        ).map_err(|e| format!("Insert error: {}", e))?;

        count += 1;
    }

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;
    Ok(count)
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
    let mut n = 0;

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
        GeoValue::Point(coord) => {
            return (coord[0], coord[1]);
        }
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
    fn test_import_admin1_with_parent() {
        let conn = test_conn();

        // First insert a country
        let countries = r#"{
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"NAME": "Testland", "ISO_A2": "TL"},
                "geometry": {"type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}
            }]
        }"#;
        import_countries(&conn, countries).unwrap();

        // Then import admin1
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

        // Verify parent linkage
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
