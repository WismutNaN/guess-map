use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

const COUNTRY_SOURCE_PREFIX: &str = "seed:phone_country";
const ADMIN1_SOURCE_PREFIX: &str = "seed:phone_admin1";

const COUNTRY_CODES_JSON: &str = include_str!("../../../assets/metadata/phone_country_codes.json");
const ADMIN1_CODES_JSON: &str = include_str!("../../../assets/metadata/phone_admin1_codes.json");

#[derive(Debug, Deserialize)]
struct PhoneCountryCatalog {
    items: Vec<PhoneCountryItem>,
}

#[derive(Debug, Deserialize)]
struct PhoneCountryItem {
    country_code: String,
    prefix: String,
    format: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PhoneAdmin1Catalog {
    items: Vec<PhoneAdmin1Item>,
}

#[derive(Debug, Deserialize)]
struct PhoneAdmin1Item {
    region_ref: String,
    country_code: String,
    prefix: String,
    format: Option<String>,
    area_codes: Option<Vec<String>>,
}

/// Seed phone_hint data:
/// - country level for all countries with known calling code
/// - admin1 overrides where region-level dial codes are available
///
/// Idempotent for seeded records (matched by source marker).
pub fn seed(conn: &Connection) -> Result<usize, String> {
    let hint_type_id: String = conn
        .query_row(
            "SELECT id FROM hint_type WHERE code = 'phone_hint'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("hint_type 'phone_hint' not found: {}", e))?;

    let countries: PhoneCountryCatalog = serde_json::from_str(COUNTRY_CODES_JSON)
        .map_err(|e| format!("Failed to parse phone country dataset: {}", e))?;
    let admin1: PhoneAdmin1Catalog = serde_json::from_str(ADMIN1_CODES_JSON)
        .map_err(|e| format!("Failed to parse phone admin1 dataset: {}", e))?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut created = 0usize;

    for item in &countries.items {
        let country_code = item.country_code.trim().to_uppercase();
        let prefix = item.prefix.trim().to_string();
        let format = item.format.as_ref().and_then(|f| normalize_text(f));

        if !is_iso2(&country_code) || !is_phone_prefix(&prefix) {
            continue;
        }

        let region_id: Option<String> = tx
            .query_row(
                "SELECT id
                 FROM region
                 WHERE region_level = 'country'
                   AND country_code = ?1
                   AND is_active = 1
                 LIMIT 1",
                [country_code.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(region_id) = region_id else {
            continue;
        };

        let seeded_exists: bool = tx
            .query_row(
                "SELECT COUNT(*) > 0
                 FROM region_hint
                 WHERE region_id = ?1
                   AND hint_type_id = ?2
                   AND source_note LIKE ?3",
                rusqlite::params![
                    region_id,
                    hint_type_id,
                    format!("{COUNTRY_SOURCE_PREFIX} %")
                ],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if seeded_exists {
            continue;
        }

        let data_json = json!({
            "prefix": prefix,
            "format": format,
        })
        .to_string();
        let full_value = match &format {
            Some(fmt) => format!("Country phone code {prefix}, format {fmt}"),
            None => format!("Country phone code {prefix}"),
        };
        let source_note = format!("{COUNTRY_SOURCE_PREFIX} {country_code}");

        tx.execute(
            "INSERT INTO region_hint (
                id, region_id, hint_type_id, short_value, full_value, data_json,
                confidence, min_zoom, max_zoom, is_visible, source_note, created_by
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                1.0, 2.0, 10.0, 1, ?7, 'import'
             )",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                region_id,
                hint_type_id,
                prefix,
                full_value,
                data_json,
                source_note,
            ],
        )
        .map_err(|e| {
            format!(
                "Failed to seed phone_hint for country {}: {}",
                country_code, e
            )
        })?;
        created += 1;
    }

    for item in &admin1.items {
        let region_ref = normalize_region_ref(&item.region_ref);
        let country_code = item.country_code.trim().to_uppercase();
        let prefix = item.prefix.trim().to_string();
        let format = item.format.as_ref().and_then(|f| normalize_text(f));
        let area_codes = item
            .area_codes
            .as_ref()
            .map(|codes| {
                codes
                    .iter()
                    .filter_map(|c| {
                        let t = c.trim();
                        if t.chars().all(|x| x.is_ascii_digit()) && !t.is_empty() {
                            Some(t.to_string())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let Some(region_ref) = region_ref else {
            continue;
        };
        if !is_iso2(&country_code) || !is_phone_prefix_with_area(&prefix) {
            continue;
        }

        let region_id: Option<String> = tx
            .query_row(
                "SELECT id
                 FROM region
                 WHERE region_level = 'admin1'
                   AND geometry_ref = ?1
                   AND country_code = ?2
                   AND is_active = 1
                 LIMIT 1",
                rusqlite::params![region_ref, country_code],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(region_id) = region_id else {
            continue;
        };

        let seeded_exists: bool = tx
            .query_row(
                "SELECT COUNT(*) > 0
                 FROM region_hint
                 WHERE region_id = ?1
                   AND hint_type_id = ?2
                   AND source_note LIKE ?3",
                rusqlite::params![region_id, hint_type_id, format!("{ADMIN1_SOURCE_PREFIX} %")],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if seeded_exists {
            continue;
        }

        let full_value = if area_codes.len() > 1 {
            format!("Regional codes: {}", area_codes.join(", "))
        } else {
            format!("Regional code: {}", prefix)
        };
        let data_json = json!({
            "prefix": prefix,
            "format": format,
            "area_codes": area_codes,
        })
        .to_string();
        let source_note = format!("{ADMIN1_SOURCE_PREFIX} {region_ref}");

        tx.execute(
            "INSERT INTO region_hint (
                id, region_id, hint_type_id, short_value, full_value, data_json,
                confidence, min_zoom, max_zoom, is_visible, source_note, created_by
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                1.0, 3.0, 12.0, 1, ?7, 'import'
             )",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                region_id,
                hint_type_id,
                prefix,
                full_value,
                data_json,
                source_note,
            ],
        )
        .map_err(|e| format!("Failed to seed phone_hint for {}: {}", region_ref, e))?;
        created += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(created)
}

fn normalize_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn is_iso2(code: &str) -> bool {
    code.len() == 2 && code.chars().all(|c| c.is_ascii_alphabetic())
}

fn is_phone_prefix(prefix: &str) -> bool {
    let rest = prefix.strip_prefix('+').unwrap_or_default();
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

fn is_phone_prefix_with_area(prefix: &str) -> bool {
    let mut parts = prefix.split_whitespace();
    let Some(root) = parts.next() else {
        return false;
    };
    if !is_phone_prefix(root) {
        return false;
    }
    parts.all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

fn normalize_region_ref(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("admin1:") {
        return None;
    }
    Some(format!("admin1:{}", trimmed[7..].to_ascii_uppercase()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn test_seed_phone_hint_country_and_admin1() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        crate::seed::hint_types::seed(&conn).unwrap();

        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'country-us', 'United States', 'United States', 'US', 'country', 'countries:US', -98.0, 39.0, 1
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'admin1-us-al', 'Alabama', 'Alabama', 'US', 'admin1', 'country-us', 'admin1:US-AL', -86.8, 32.8, 1
             )",
            [],
        )
        .unwrap();

        let created = seed(&conn).unwrap();
        assert!(created >= 2);

        let country_hint: String = conn
            .query_row(
                "SELECT rh.short_value
                 FROM region_hint rh
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 WHERE rh.region_id = 'country-us'
                   AND ht.code = 'phone_hint'
                   AND rh.source_note LIKE 'seed:phone_country %'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(country_hint, "+1");

        let admin1_hint: String = conn
            .query_row(
                "SELECT rh.short_value
                 FROM region_hint rh
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 WHERE rh.region_id = 'admin1-us-al'
                   AND ht.code = 'phone_hint'
                   AND rh.source_note LIKE 'seed:phone_admin1 %'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(admin1_hint.starts_with("+1 "));
    }

    #[test]
    fn test_seed_phone_hint_idempotent() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        crate::seed::hint_types::seed(&conn).unwrap();
        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'country-ru', 'Russia', 'Russia', 'RU', 'country', 'countries:RU', 90.0, 60.0, 1
             )",
            [],
        )
        .unwrap();

        let first = seed(&conn).unwrap();
        let second = seed(&conn).unwrap();
        assert!(first >= 1);
        assert_eq!(second, 0);
    }

    #[test]
    fn test_seed_phone_hint_br_admin1_override() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        crate::seed::hint_types::seed(&conn).unwrap();
        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'country-br', 'Brazil', 'Brazil', 'BR', 'country', 'countries:BR', -52.0, -10.0, 1
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'admin1-br-sp', 'Sao Paulo', 'Sao Paulo', 'BR', 'admin1', 'country-br', 'admin1:BR-SP', -46.6, -23.5, 1
             )",
            [],
        )
        .unwrap();

        let _ = seed(&conn).unwrap();

        let country_hint: String = conn
            .query_row(
                "SELECT rh.short_value
                 FROM region_hint rh
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 WHERE rh.region_id = 'country-br'
                   AND ht.code = 'phone_hint'
                   AND rh.source_note LIKE 'seed:phone_country %'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(country_hint, "+55");

        let admin1_hint: String = conn
            .query_row(
                "SELECT rh.short_value
                 FROM region_hint rh
                 JOIN hint_type ht ON rh.hint_type_id = ht.id
                 WHERE rh.region_id = 'admin1-br-sp'
                   AND ht.code = 'phone_hint'
                   AND rh.source_note LIKE 'seed:phone_admin1 %'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(admin1_hint, "+55 11");
    }
}
