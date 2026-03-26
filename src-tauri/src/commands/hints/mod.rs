mod models;
mod repository;
mod service;
mod validator;

use crate::compiler;
use crate::db::DbState;
pub use models::{CreateHintInput, HintTypeInfo, RegionHintInfo, UpdateHintInput};
use tauri::State;

/// Get all hint types.
#[tauri::command]
pub fn get_hint_types(db: State<'_, DbState>) -> Result<Vec<HintTypeInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::list_hint_types(&conn)
}

/// Get hint count per type.
#[tauri::command]
pub fn get_hint_counts(
    db: State<'_, DbState>,
) -> Result<std::collections::HashMap<String, usize>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::count_hints_by_type(&conn)
}

/// Get all hints for a region.
#[tauri::command]
pub fn get_hints_by_region(
    db: State<'_, DbState>,
    region_id: String,
) -> Result<Vec<RegionHintInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::list_hints_by_region(&conn, &region_id)
}

/// Get all hints for a given hint type code.
#[tauri::command]
pub fn get_hints_by_type(
    db: State<'_, DbState>,
    hint_type_code: String,
) -> Result<Vec<RegionHintInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::list_hints_by_type(&conn, &hint_type_code)
}

#[tauri::command]
pub fn create_hint(
    db: State<'_, DbState>,
    input: CreateHintInput,
) -> Result<RegionHintInfo, String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    service::create_hint(&mut conn, input)
}

#[tauri::command]
pub fn update_hint(
    db: State<'_, DbState>,
    input: UpdateHintInput,
) -> Result<RegionHintInfo, String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    service::update_hint(&mut conn, input)
}

#[tauri::command]
pub fn delete_hint(
    db: State<'_, DbState>,
    hint_id: String,
    created_by: Option<String>,
) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    service::delete_hint(&mut conn, &hint_id, created_by)
}

/// Compile a hint layer to GeoJSON (point source).
#[tauri::command]
pub fn compile_hint_layer(
    db: State<'_, DbState>,
    hint_type_code: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    compiler::compile_point_layer(&conn, &hint_type_code)
}

/// Compile polygon enrichment data for a hint type (driving_side, coverage, etc.).
/// Returns a JSON map: { "US": { "side": "right", "color": "#D94A4A" }, ... }
#[tauri::command]
pub fn compile_polygon_enrichment(
    db: State<'_, DbState>,
    hint_type_code: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let map = compiler::compile_polygon_enrichment(&conn, &hint_type_code)?;
    serde_json::to_string(&map).map_err(|e| e.to_string())
}

/// Compile a line hint layer to GeoJSON (LineString/MultiLineString source).
#[tauri::command]
pub fn compile_line_layer(
    db: State<'_, DbState>,
    hint_type_code: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    compiler::compile_line_layer(&conn, &hint_type_code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;
    use crate::import::geodata;
    use crate::seed::hint_types;
    use rusqlite::Connection;
    use serde_json::json;

    fn setup_conn() -> Connection {
        let db = DbState::new_in_memory().unwrap();
        let conn = db.conn.into_inner().unwrap();

        hint_types::seed(&conn).unwrap();
        let countries = r#"{
            "type": "FeatureCollection",
            "features": [
                {"type":"Feature","properties":{"NAME":"India","NAME_EN":"India","ISO_A2":"IN"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}
            ]
        }"#;
        geodata::import_countries(&conn, countries).unwrap();
        conn
    }

    fn region_id(conn: &Connection, country_code: &str) -> String {
        conn.query_row(
            "SELECT id FROM region WHERE country_code = ?1 AND region_level = 'country'",
            [country_code],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn test_create_hint_writes_revision() {
        let mut conn = setup_conn();
        let region_id = region_id(&conn, "IN");

        let created = service::create_hint(
            &mut conn,
            CreateHintInput {
                region_id,
                hint_type_code: "note".to_string(),
                short_value: Some("Use left side clues".to_string()),
                full_value: None,
                data_json: None,
                color: Some("#3366CC".to_string()),
                confidence: Some(0.9),
                min_zoom: Some(2.0),
                max_zoom: Some(10.0),
                is_visible: Some(true),
                image_asset_id: None,
                icon_asset_id: None,
                source_note: Some("manual".to_string()),
                created_by: Some("user".to_string()),
            },
        )
        .unwrap();

        assert_eq!(created.hint_type_code, "note");
        let rev_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM revision_log WHERE entity_type='region_hint' AND action='create'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rev_count, 1);
    }

    #[test]
    fn test_update_hint_writes_diff() {
        let mut conn = setup_conn();
        let region_id = region_id(&conn, "IN");

        let created = service::create_hint(
            &mut conn,
            CreateHintInput {
                region_id: region_id.clone(),
                hint_type_code: "note".to_string(),
                short_value: Some("old".to_string()),
                full_value: None,
                data_json: None,
                color: None,
                confidence: None,
                min_zoom: None,
                max_zoom: None,
                is_visible: Some(true),
                image_asset_id: None,
                icon_asset_id: None,
                source_note: None,
                created_by: Some("user".to_string()),
            },
        )
        .unwrap();

        let updated = service::update_hint(
            &mut conn,
            UpdateHintInput {
                id: created.id.clone(),
                region_id,
                hint_type_code: "note".to_string(),
                short_value: Some("new".to_string()),
                full_value: Some("updated full".to_string()),
                data_json: Some(json!({"foo":"bar"})),
                color: Some("#AA22CC".to_string()),
                confidence: Some(0.5),
                min_zoom: Some(3.0),
                max_zoom: Some(12.0),
                is_visible: Some(true),
                image_asset_id: None,
                icon_asset_id: None,
                source_note: Some("edit".to_string()),
                created_by: Some("user".to_string()),
            },
        )
        .unwrap();

        assert_eq!(updated.short_value.as_deref(), Some("new"));

        let diff_json: String = conn
            .query_row(
                "SELECT diff_json FROM revision_log WHERE entity_id = ?1 AND action='update' ORDER BY created_at DESC LIMIT 1",
                [created.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(diff_json.contains("\"short_value\""));
        assert!(diff_json.contains("\"old\":\"old\""));
        assert!(diff_json.contains("\"new\":\"new\""));
    }

    #[test]
    fn test_delete_hint_writes_revision() {
        let mut conn = setup_conn();
        let region_id = region_id(&conn, "IN");

        let created = service::create_hint(
            &mut conn,
            CreateHintInput {
                region_id,
                hint_type_code: "note".to_string(),
                short_value: Some("to delete".to_string()),
                full_value: None,
                data_json: None,
                color: None,
                confidence: None,
                min_zoom: None,
                max_zoom: None,
                is_visible: Some(true),
                image_asset_id: None,
                icon_asset_id: None,
                source_note: None,
                created_by: Some("user".to_string()),
            },
        )
        .unwrap();

        service::delete_hint(&mut conn, &created.id, Some("user".to_string())).unwrap();

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM region_hint WHERE id = ?1",
                [created.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!exists);

        let delete_logs: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM revision_log WHERE action='delete' AND entity_type='region_hint'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(delete_logs, 1);
    }

    #[test]
    fn test_schema_validation_rejects_invalid_enum() {
        let mut conn = setup_conn();
        let region_id = region_id(&conn, "IN");

        let result = service::create_hint(
            &mut conn,
            CreateHintInput {
                region_id,
                hint_type_code: "driving_side".to_string(),
                short_value: Some("left".to_string()),
                full_value: None,
                data_json: Some(json!({"side":"wrong"})),
                color: Some("#111111".to_string()),
                confidence: Some(1.0),
                min_zoom: None,
                max_zoom: None,
                is_visible: Some(true),
                image_asset_id: None,
                icon_asset_id: None,
                source_note: None,
                created_by: Some("user".to_string()),
            },
        );

        assert!(result.is_err());
    }
}
