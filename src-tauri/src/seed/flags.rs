use rusqlite::Connection;
use uuid::Uuid;

/// Seed flag hints for all countries using emoji flags as short_value.
/// Actual flag images will be loaded later; for now emoji serves as the visual.
pub fn seed(conn: &Connection) -> Result<usize, String> {
    let existing: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = 'flag'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if existing > 0 {
        return Ok(0);
    }

    let hint_type_id: String = conn
        .query_row("SELECT id FROM hint_type WHERE code = 'flag'", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("hint_type 'flag' not found: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, country_code, name FROM region WHERE region_level = 'country' AND country_code IS NOT NULL")
        .map_err(|e| e.to_string())?;

    let countries: Vec<(String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let mut count = 0;
    for (region_id, country_code, name) in &countries {
        let emoji = match country_code_to_flag_emoji(country_code) {
            Some(e) => e,
            None => continue, // skip invalid codes like "-1", "-99"
        };

        tx.execute(
            "INSERT INTO region_hint (id, region_id, hint_type_id, short_value, full_value, min_zoom, confidence, source_note, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, 3.0, 1.0, 'seed', 'import')",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                region_id,
                hint_type_id,
                emoji,
                name,
            ],
        )
        .map_err(|e| format!("Failed to seed flag for {}: {}", country_code, e))?;

        count += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

/// Convert a 2-letter country code to a flag emoji.
/// "US" → "🇺🇸", "GB" → "🇬🇧"
fn country_code_to_flag_emoji(code: &str) -> Option<String> {
    let mut result = String::new();
    for c in code.chars() {
        if !c.is_ascii_alphabetic() {
            return None;
        }
        let regional = c.to_ascii_uppercase() as u32 - 'A' as u32 + 0x1F1E6;
        result.push(char::from_u32(regional)?);
    }
    if result.is_empty() {
        return None;
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flag_emoji() {
        assert_eq!(country_code_to_flag_emoji("US"), Some("🇺🇸".into()));
        assert_eq!(country_code_to_flag_emoji("GB"), Some("🇬🇧".into()));
        assert_eq!(country_code_to_flag_emoji("JP"), Some("🇯🇵".into()));
        assert_eq!(country_code_to_flag_emoji("-1"), None);
        assert_eq!(country_code_to_flag_emoji("-99"), None);
    }
}
