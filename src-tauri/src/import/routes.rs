use geojson::{FeatureCollection, Value as GeoValue};
use rusqlite::Connection;
use serde_json::json;

const HIGHWAY_HINT_TYPE_CODE: &str = "highway";

/// Import route GeoJSON into SQLite as:
/// - region (region_level='route', geometry_ref='routes:<route_id>')
/// - region_hint for hint_type='highway'
///
/// Returns number of processed route features.
pub fn import_routes(conn: &Connection, geojson_str: &str) -> Result<usize, String> {
    let fc: FeatureCollection = geojson_str
        .parse::<geojson::GeoJson>()
        .map_err(|e| format!("Failed to parse routes GeoJSON: {}", e))?
        .try_into()
        .map_err(|e| format!("Not a FeatureCollection: {}", e))?;

    let hint_type_id: String = conn
        .query_row(
            "SELECT id FROM hint_type WHERE code = ?1 LIMIT 1",
            [HIGHWAY_HINT_TYPE_CODE],
            |row| row.get(0),
        )
        .map_err(|e| format!("Hint type '{}' not found: {}", HIGHWAY_HINT_TYPE_CODE, e))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    let mut count = 0usize;

    for feature in &fc.features {
        let props = match &feature.properties {
            Some(p) => p,
            None => continue,
        };

        let route_id = props
            .get("route_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty());
        let route_id = match route_id {
            Some(v) => v.trim(),
            None => continue,
        };

        let route_number = props
            .get("route_number")
            .and_then(|v| v.as_str())
            .unwrap_or(route_id);
        let route_name = props
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(route_number);
        let route_system = props
            .get("route_system")
            .and_then(|v| v.as_str())
            .unwrap_or("other");
        let direction = props
            .get("direction")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        let color = props
            .get("color")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let countries: Vec<String> = props
            .get("countries")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();
        let country_code = countries.first().cloned();

        let (anchor_lng, anchor_lat) = match &feature.geometry {
            Some(g) => anchor_from_geometry_value(&g.value).unwrap_or((0.0, 0.0)),
            None => (0.0, 0.0),
        };

        let region_id = format!("route:{}", route_id);
        let hint_id = format!("route_hint:{}", route_id);
        let geometry_ref = format!("routes:{}", route_id);

        tx.execute(
            "INSERT INTO region (id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active)
             VALUES (?1, ?2, ?3, ?4, 'route', ?5, ?6, ?7, 1)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               name_en = excluded.name_en,
               country_code = excluded.country_code,
               geometry_ref = excluded.geometry_ref,
               anchor_lng = excluded.anchor_lng,
               anchor_lat = excluded.anchor_lat,
               is_active = 1",
            rusqlite::params![
                region_id,
                route_name,
                route_name,
                country_code,
                geometry_ref,
                anchor_lng,
                anchor_lat,
            ],
        )
        .map_err(|e| format!("Insert route region failed: {}", e))?;

        let data_json = json!({
            "route_id": route_id,
            "route_system": route_system,
            "route_number": route_number,
            "direction": direction,
            "countries": countries,
        });

        tx.execute(
            "INSERT INTO region_hint (
                id, region_id, hint_type_id, short_value, full_value, data_json, color,
                confidence, min_zoom, max_zoom, is_visible, created_by
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                1.0, 0.0, 22.0, 1, 'seed'
             )
             ON CONFLICT(id) DO UPDATE SET
                region_id = excluded.region_id,
                hint_type_id = excluded.hint_type_id,
                short_value = excluded.short_value,
                full_value = excluded.full_value,
                data_json = excluded.data_json,
                color = excluded.color,
                is_visible = 1,
                updated_at = datetime('now')",
            rusqlite::params![
                hint_id,
                region_id,
                hint_type_id,
                route_number,
                route_name,
                serde_json::to_string(&data_json).map_err(|e| e.to_string())?,
                color,
            ],
        )
        .map_err(|e| format!("Insert route hint failed: {}", e))?;

        count += 1;
    }

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;
    Ok(count)
}

fn anchor_from_geometry_value(value: &GeoValue) -> Option<(f64, f64)> {
    match value {
        GeoValue::LineString(coords) => midpoint_line_string(coords),
        GeoValue::MultiLineString(lines) => {
            lines.first().and_then(|line| midpoint_line_string(line))
        }
        _ => None,
    }
}

fn midpoint_line_string(coords: &Vec<Vec<f64>>) -> Option<(f64, f64)> {
    if coords.is_empty() {
        return None;
    }
    let mid = coords.len() / 2;
    let p = coords.get(mid)?;
    if p.len() < 2 {
        return None;
    }
    Some((p[0], p[1]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, seed};

    fn setup_conn() -> Connection {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.into_inner().unwrap();
        seed::hint_types::seed(&conn).unwrap();
        conn
    }

    #[test]
    fn test_import_routes_creates_region_and_hint() {
        let conn = setup_conn();
        let geojson = r##"{
          "type":"FeatureCollection",
          "features":[
            {
              "type":"Feature",
              "properties":{
                "route_id":"us-i10",
                "route_system":"us_interstate",
                "route_number":"I-10",
                "name":"Interstate 10",
                "direction":"E-W",
                "color":"#E31937",
                "countries":["US"]
              },
              "geometry":{
                "type":"LineString",
                "coordinates":[[-118.49,34.01],[-81.66,30.33]]
              }
            }
          ]
        }"##;

        let count = import_routes(&conn, geojson).unwrap();
        assert_eq!(count, 1);

        let route_regions: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM region WHERE region_level = 'route'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(route_regions, 1);

        let highway_hints: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM region_hint rh
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 WHERE ht.code = 'highway'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(highway_hints, 1);
    }

    #[test]
    fn test_import_routes_idempotent_by_deterministic_ids() {
        let conn = setup_conn();
        let geojson = r#"{
          "type":"FeatureCollection",
          "features":[
            {
              "type":"Feature",
              "properties":{
                "route_id":"e-40",
                "route_system":"european_e",
                "route_number":"E40",
                "name":"European route E40",
                "direction":"E-W",
                "countries":["FR","BE"]
              },
              "geometry":{
                "type":"LineString",
                "coordinates":[[2.35,48.85],[4.35,50.85]]
              }
            }
          ]
        }"#;

        import_routes(&conn, geojson).unwrap();
        import_routes(&conn, geojson).unwrap();

        let regions: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM region WHERE id='route:e-40'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let hints: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM region_hint WHERE id='route_hint:e-40'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(regions, 1);
        assert_eq!(hints, 1);
    }
}
