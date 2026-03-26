pub(crate) mod models;
pub(crate) mod repository;

use crate::db::DbState;
pub use models::{RegionInfo, RegionStats};
use tauri::State;

#[tauri::command]
pub fn get_region_stats(db: State<'_, DbState>) -> Result<RegionStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::get_region_stats(&conn)
}

#[tauri::command]
pub fn search_regions(
    db: State<'_, DbState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<RegionInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::search_regions(&conn, &query, limit)
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
    repository::resolve_region(
        &conn,
        &region_level,
        country_code.as_deref(),
        geometry_ref.as_deref(),
        name.as_deref(),
    )
}

#[tauri::command]
pub fn get_region_by_id(
    db: State<'_, DbState>,
    region_id: String,
) -> Result<Option<RegionInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::get_region_by_id(&conn, &region_id)
}

#[tauri::command]
pub fn list_regions_by_country(
    db: State<'_, DbState>,
    country_code: String,
    region_level: Option<String>,
) -> Result<Vec<RegionInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::list_regions_by_country(&conn, &country_code, region_level.as_deref())
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
        let results = repository::search_regions(&conn, "karn", Some(20)).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Karnataka");
    }

    #[test]
    fn test_resolve_region_by_geometry_ref() {
        let conn = setup_conn();
        let result = repository::resolve_region(
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

    #[test]
    fn test_list_regions_by_country_with_level_filter() {
        let conn = setup_conn();
        let regions = repository::list_regions_by_country(&conn, "IN", Some("admin1")).unwrap();
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].name, "Karnataka");
        assert_eq!(regions[0].region_level, "admin1");
    }
}
