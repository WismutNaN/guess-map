use crate::compiler;
use crate::db::DbState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct HintTypeInfo {
    pub id: String,
    pub code: String,
    pub title: String,
    pub display_family: String,
    pub schema_json: Option<String>,
    pub sort_order: i32,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct RegionHintInfo {
    pub id: String,
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<String>,
    pub color: Option<String>,
    pub confidence: f64,
}

/// Get all hint types.
#[tauri::command]
pub fn get_hint_types(db: State<'_, DbState>) -> Result<Vec<HintTypeInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, code, title, display_family, schema_json, sort_order, is_active
             FROM hint_type ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let types = stmt
        .query_map([], |row| {
            Ok(HintTypeInfo {
                id: row.get(0)?,
                code: row.get(1)?,
                title: row.get(2)?,
                display_family: row.get(3)?,
                schema_json: row.get(4)?,
                sort_order: row.get(5)?,
                is_active: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(types)
}

/// Get hint count per type.
#[tauri::command]
pub fn get_hint_counts(db: State<'_, DbState>) -> Result<std::collections::HashMap<String, usize>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ht.code, COUNT(rh.id)
             FROM hint_type ht
             LEFT JOIN region_hint rh ON ht.id = rh.hint_type_id
             GROUP BY ht.code",
        )
        .map_err(|e| e.to_string())?;

    let mut counts = std::collections::HashMap::new();
    stmt.query_map([], |row| {
        let code: String = row.get(0)?;
        let count: usize = row.get(1)?;
        Ok((code, count))
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .for_each(|(code, count)| {
        counts.insert(code, count);
    });

    Ok(counts)
}

/// Get all hints for a region.
#[tauri::command]
pub fn get_hints_by_region(db: State<'_, DbState>, region_id: String) -> Result<Vec<RegionHintInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.region_id, ht.code, rh.short_value, rh.full_value,
                    rh.data_json, rh.color, rh.confidence
             FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE rh.region_id = ?1
             ORDER BY ht.sort_order",
        )
        .map_err(|e| e.to_string())?;

    let hints = stmt
        .query_map([&region_id], |row| {
            Ok(RegionHintInfo {
                id: row.get(0)?,
                region_id: row.get(1)?,
                hint_type_code: row.get(2)?,
                short_value: row.get(3)?,
                full_value: row.get(4)?,
                data_json: row.get(5)?,
                color: row.get(6)?,
                confidence: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(hints)
}

/// Compile a hint layer to GeoJSON (point source).
#[tauri::command]
pub fn compile_hint_layer(db: State<'_, DbState>, hint_type_code: String) -> Result<String, String> {
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
