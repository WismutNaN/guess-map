use crate::db::DbState;
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct RegionInfo {
    pub id: String,
    pub name: String,
    pub name_en: Option<String>,
    pub country_code: Option<String>,
    pub region_level: String,
    pub geometry_ref: Option<String>,
    pub anchor_lng: Option<f64>,
    pub anchor_lat: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct RegionStats {
    pub countries: usize,
    pub admin1: usize,
    pub total: usize,
}

#[tauri::command]
pub fn get_region_stats(db: State<'_, DbState>) -> Result<RegionStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let countries: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region WHERE region_level = 'country'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let admin1: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region WHERE region_level = 'admin1'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(RegionStats {
        countries,
        admin1,
        total: countries + admin1,
    })
}

#[tauri::command]
pub fn search_regions(
    db: State<'_, DbState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<RegionInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    search_regions_impl(&conn, &query, limit)
}

#[tauri::command]
pub fn resolve_region(
    db: State<'_, DbState>,
    region_level: String,
    country_code: Option<String>,
    geometry_ref: Option<String>,
    name: Option<String>,
) -> Result<Option<RegionInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    resolve_region_impl(
        &conn,
        &region_level,
        country_code.as_deref(),
        geometry_ref.as_deref(),
        name.as_deref(),
    )
}

#[tauri::command]
pub fn get_region_by_id(db: State<'_, DbState>, region_id: String) -> Result<Option<RegionInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
         FROM region
         WHERE id = ?1 AND is_active = 1",
        [region_id],
        row_to_region_info,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn search_regions_impl(
    conn: &rusqlite::Connection,
    query: &str,
    limit: Option<usize>,
) -> Result<Vec<RegionInfo>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let limit = limit.unwrap_or(20).clamp(1, 100);
    let search = format!("%{}%", q);

    let mut stmt = conn
        .prepare(
            "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
             FROM region
             WHERE is_active = 1
               AND (name LIKE ?1 OR name_en LIKE ?1 OR country_code LIKE ?1)
             ORDER BY
               CASE region_level WHEN 'country' THEN 0 WHEN 'admin1' THEN 1 ELSE 2 END,
               name
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let regions = stmt
        .query_map(rusqlite::params![search, limit], row_to_region_info)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(regions)
}

fn resolve_region_impl(
    conn: &rusqlite::Connection,
    region_level: &str,
    country_code: Option<&str>,
    geometry_ref: Option<&str>,
    name: Option<&str>,
) -> Result<Option<RegionInfo>, String> {
    if let Some(geometry_ref) = geometry_ref.and_then(non_empty_trimmed) {
        return conn
            .query_row(
                "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
                 FROM region
                 WHERE geometry_ref = ?1 AND is_active = 1
                 LIMIT 1",
                [geometry_ref],
                row_to_region_info,
            )
            .optional()
            .map_err(|e| e.to_string());
    }

    match region_level {
        "country" => {
            let Some(cc) = country_code.and_then(non_empty_trimmed) else {
                return Ok(None);
            };
            conn.query_row(
                "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
                 FROM region
                 WHERE region_level = 'country' AND country_code = ?1 AND is_active = 1
                 LIMIT 1",
                [cc],
                row_to_region_info,
            )
            .optional()
            .map_err(|e| e.to_string())
        }
        "admin1" => {
            let Some(cc) = country_code.and_then(non_empty_trimmed) else {
                return Ok(None);
            };

            if let Some(name) = name.and_then(non_empty_trimmed) {
                return conn
                    .query_row(
                        "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
                         FROM region
                         WHERE region_level = 'admin1'
                           AND country_code = ?1
                           AND is_active = 1
                           AND (name = ?2 OR name_en = ?2)
                         LIMIT 1",
                        rusqlite::params![cc, name],
                        row_to_region_info,
                    )
                    .optional()
                    .map_err(|e| e.to_string());
            }

            Ok(None)
        }
        _ => Ok(None),
    }
}

fn non_empty_trimmed(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn row_to_region_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<RegionInfo> {
    Ok(RegionInfo {
        id: row.get(0)?,
        name: row.get(1)?,
        name_en: row.get(2)?,
        country_code: row.get(3)?,
        region_level: row.get(4)?,
        geometry_ref: row.get(5)?,
        anchor_lng: row.get(6)?,
        anchor_lat: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;
    use crate::seed::hint_types;
    use uuid::Uuid;

    fn setup_conn() -> rusqlite::Connection {
        let db = DbState::new_in_memory().unwrap();
        let conn = db.conn.into_inner().unwrap();
        hint_types::seed(&conn).unwrap();

        let country_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO region (id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat)
             VALUES (?1, 'India', 'India', 'IN', 'country', 'countries:IN', 78.96, 20.59)",
            [&country_id],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO region (id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat)
             VALUES (?1, 'Karnataka', 'Karnataka', 'IN', 'admin1', ?2, 'admin1:IN-KA', 76.0, 15.0)",
            rusqlite::params![Uuid::new_v4().to_string(), country_id],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_search_regions_karn() {
        let conn = setup_conn();
        let results = search_regions_impl(&conn, "karn", Some(20)).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Karnataka");
    }

    #[test]
    fn test_resolve_region_by_geometry_ref() {
        let conn = setup_conn();
        let result = resolve_region_impl(
            &conn,
            "admin1",
            Some("IN"),
            Some("admin1:IN-KA"),
            Some("Karnataka"),
        )
        .unwrap();
        let region = result.expect("region not found");
        assert_eq!(region.name, "Karnataka");
        assert_eq!(region.region_level, "admin1");
    }
}
