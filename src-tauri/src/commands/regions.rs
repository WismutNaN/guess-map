use crate::db::DbState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct RegionInfo {
    pub id: String,
    pub name: String,
    pub name_en: Option<String>,
    pub country_code: Option<String>,
    pub region_level: String,
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
    let limit = limit.unwrap_or(20);
    let search = format!("%{}%", query);

    let mut stmt = conn
        .prepare(
            "SELECT id, name, name_en, country_code, region_level, anchor_lng, anchor_lat
             FROM region
             WHERE name LIKE ?1 OR name_en LIKE ?1 OR country_code LIKE ?1
             ORDER BY
               CASE region_level WHEN 'country' THEN 0 WHEN 'admin1' THEN 1 ELSE 2 END,
               name
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let regions = stmt
        .query_map(rusqlite::params![search, limit], |row| {
            Ok(RegionInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                name_en: row.get(2)?,
                country_code: row.get(3)?,
                region_level: row.get(4)?,
                anchor_lng: row.get(5)?,
                anchor_lat: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(regions)
}
