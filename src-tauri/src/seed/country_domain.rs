use rusqlite::Connection;
use serde_json::json;
use uuid::Uuid;

const SOURCE_PREFIX: &str = "seed:country_tld";

/// Seed country_domain hints for all countries. Idempotent.
pub fn seed(conn: &Connection) -> Result<usize, String> {
    let existing: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = 'country_domain'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if existing > 0 {
        return Ok(0);
    }

    let hint_type_id: String = conn
        .query_row(
            "SELECT id FROM hint_type WHERE code = 'country_domain'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("hint_type 'country_domain' not found: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, country_code, name
             FROM region
             WHERE region_level = 'country'
               AND country_code IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;

    let countries: Vec<(String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut count = 0;

    for (region_id, country_code, name) in &countries {
        let Some((code, tld)) = country_code_to_tld(country_code) else {
            continue;
        };

        let full_value = format!("Country domain for {}", name);
        let data_json = json!({
            "tld": tld,
            "country_code": code,
        });
        let source_note = format!("{SOURCE_PREFIX} {code} {tld}");

        tx.execute(
            "INSERT INTO region_hint (
                id, region_id, hint_type_id, short_value, full_value, data_json,
                confidence, min_zoom, max_zoom, is_visible, source_note, created_by
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                1.0, 2.0, 8.0, 1, ?7, 'import'
             )",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                region_id,
                hint_type_id,
                tld,
                full_value,
                data_json.to_string(),
                source_note,
            ],
        )
        .map_err(|e| format!("Failed to seed country_domain for {}: {}", code, e))?;

        count += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

fn country_code_to_tld(raw_code: &str) -> Option<(String, String)> {
    let code = raw_code.trim().to_ascii_uppercase();
    if code.len() != 2 || !code.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }

    let suffix = if code == "GB" {
        "uk".to_string()
    } else {
        code.to_ascii_lowercase()
    };

    Some((code, format!(".{}", suffix)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::import::geodata;

    #[test]
    fn test_seed_country_domains() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        crate::seed::hint_types::seed(&conn).unwrap();

        let geojson = r#"{
            "type": "FeatureCollection",
            "features": [
                {"type":"Feature","properties":{"NAME":"United Kingdom","ISO_A2":"GB"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}},
                {"type":"Feature","properties":{"NAME":"Russia","ISO_A2":"RU"},"geometry":{"type":"Polygon","coordinates":[[[2,2],[3,2],[3,3],[2,2]]]}}
            ]
        }"#;
        geodata::import_countries(&conn, geojson).unwrap();

        let count = seed(&conn).unwrap();
        assert_eq!(count, 2);

        let gb_tld: String = conn
            .query_row(
                "SELECT rh.short_value
                 FROM region_hint rh
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 JOIN region r ON rh.region_id = r.id
                 WHERE ht.code = 'country_domain'
                   AND r.country_code = 'GB'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(gb_tld, ".uk");

        let ru_tld: String = conn
            .query_row(
                "SELECT rh.short_value
                 FROM region_hint rh
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 JOIN region r ON rh.region_id = r.id
                 WHERE ht.code = 'country_domain'
                   AND r.country_code = 'RU'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(ru_tld, ".ru");
    }

    #[test]
    fn test_seed_country_domains_idempotent() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        crate::seed::hint_types::seed(&conn).unwrap();

        let geojson = r#"{
            "type": "FeatureCollection",
            "features": [
                {"type":"Feature","properties":{"NAME":"Japan","ISO_A2":"JP"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}
            ]
        }"#;
        geodata::import_countries(&conn, geojson).unwrap();

        let first = seed(&conn).unwrap();
        let second = seed(&conn).unwrap();
        assert_eq!(first, 1);
        assert_eq!(second, 0);
    }
}

