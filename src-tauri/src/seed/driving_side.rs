use rusqlite::Connection;
use uuid::Uuid;

/// Countries that drive on the left side of the road.
const LEFT_DRIVING: &[&str] = &[
    "AI", "AG", "AU", "BS", "BD", "BB", "BM", "BT", "BW", "BN", "KY", "CX", "CC", "CK",
    "CY", "DM", "FK", "FJ", "GD", "GG", "GY", "HK", "IN", "ID", "IE", "IM", "JM", "JP",
    "JE", "KE", "KI", "LS", "MO", "MW", "MY", "MV", "MT", "MU", "MS", "MZ", "NA", "NR",
    "NP", "NZ", "NU", "NF", "PK", "PG", "PN", "KN", "LC", "VC", "WS", "SC", "SG", "SB",
    "ZA", "LK", "SH", "SR", "SZ", "TZ", "TH", "TL", "TK", "TO", "TT", "TC", "TV", "UG",
    "GB", "VG", "VI", "ZM", "ZW",
];

/// Seed driving_side hints for all countries. Idempotent.
pub fn seed(conn: &Connection) -> Result<usize, String> {
    // Check if already seeded
    let existing: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = 'driving_side'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if existing > 0 {
        return Ok(0);
    }

    // Get driving_side hint_type id
    let hint_type_id: String = conn
        .query_row(
            "SELECT id FROM hint_type WHERE code = 'driving_side'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("hint_type 'driving_side' not found: {}", e))?;

    // Get all countries
    let mut stmt = conn
        .prepare("SELECT id, country_code FROM region WHERE region_level = 'country'")
        .map_err(|e| e.to_string())?;

    let countries: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    for (region_id, country_code) in &countries {
        let side = if LEFT_DRIVING.contains(&country_code.as_str()) {
            "left"
        } else {
            "right"
        };

        let color = match side {
            "left" => "#4A90D9",
            "right" => "#D94A4A",
            _ => "#CCCCCC",
        };

        let data_json = format!(r#"{{"side":"{}"}}"#, side);

        tx.execute(
            "INSERT INTO region_hint (id, region_id, hint_type_id, short_value, data_json, color, confidence, source_note, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1.0, 'seed', 'import')",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                region_id,
                hint_type_id,
                side,
                data_json,
                color,
            ],
        )
        .map_err(|e| format!("Failed to seed driving_side for {}: {}", country_code, e))?;

        count += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::import::geodata;

    #[test]
    fn test_seed_driving_side() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        // Need hint_types first
        crate::seed::hint_types::seed(&conn).unwrap();

        // Need some countries
        let geojson = r#"{
            "type": "FeatureCollection",
            "features": [
                {"type":"Feature","properties":{"NAME":"United Kingdom","ISO_A2":"GB"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}},
                {"type":"Feature","properties":{"NAME":"France","ISO_A2":"FR"},"geometry":{"type":"Polygon","coordinates":[[[2,2],[3,2],[3,3],[2,2]]]}},
                {"type":"Feature","properties":{"NAME":"Japan","ISO_A2":"JP"},"geometry":{"type":"Polygon","coordinates":[[[4,4],[5,4],[5,5],[4,4]]]}}
            ]
        }"#;
        geodata::import_countries(&conn, geojson).unwrap();

        let count = seed(&conn).unwrap();
        assert_eq!(count, 3);

        // UK and JP should be left, France should be right
        let gb_side: String = conn
            .query_row(
                "SELECT rh.short_value FROM region_hint rh
                 JOIN region r ON rh.region_id = r.id
                 WHERE r.country_code = 'GB'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(gb_side, "left");

        let fr_side: String = conn
            .query_row(
                "SELECT rh.short_value FROM region_hint rh
                 JOIN region r ON rh.region_id = r.id
                 WHERE r.country_code = 'FR'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fr_side, "right");
    }
}
