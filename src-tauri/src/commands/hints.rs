use crate::compiler;
use crate::db::DbState;
use crate::services::revision;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Clone)]
pub struct HintTypeInfo {
    pub id: String,
    pub code: String,
    pub title: String,
    pub display_family: String,
    pub schema_json: Option<String>,
    pub sort_order: i32,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct RegionHintInfo {
    pub id: String,
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<String>,
    pub color: Option<String>,
    pub confidence: f64,
    pub min_zoom: f64,
    pub max_zoom: f64,
    pub is_visible: bool,
    pub image_asset_id: Option<String>,
    pub icon_asset_id: Option<String>,
    pub source_note: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateHintInput {
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<Value>,
    pub color: Option<String>,
    pub confidence: Option<f64>,
    pub min_zoom: Option<f64>,
    pub max_zoom: Option<f64>,
    pub is_visible: Option<bool>,
    pub image_asset_id: Option<String>,
    pub icon_asset_id: Option<String>,
    pub source_note: Option<String>,
    pub created_by: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHintInput {
    pub id: String,
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<Value>,
    pub color: Option<String>,
    pub confidence: Option<f64>,
    pub min_zoom: Option<f64>,
    pub max_zoom: Option<f64>,
    pub is_visible: Option<bool>,
    pub image_asset_id: Option<String>,
    pub icon_asset_id: Option<String>,
    pub source_note: Option<String>,
    pub created_by: Option<String>,
}

#[derive(Debug, Clone)]
struct HintTypeMeta {
    id: String,
    schema_json: Option<String>,
}

#[derive(Debug, Clone)]
struct HintRecord {
    id: String,
    region_id: String,
    hint_type_id: String,
    hint_type_code: String,
    short_value: Option<String>,
    full_value: Option<String>,
    data_json: Option<String>,
    color: Option<String>,
    confidence: f64,
    min_zoom: f64,
    max_zoom: f64,
    is_visible: bool,
    image_asset_id: Option<String>,
    icon_asset_id: Option<String>,
    source_note: Option<String>,
    created_by: String,
    created_at: String,
    updated_at: String,
}

impl HintRecord {
    fn to_info(&self) -> RegionHintInfo {
        RegionHintInfo {
            id: self.id.clone(),
            region_id: self.region_id.clone(),
            hint_type_code: self.hint_type_code.clone(),
            short_value: self.short_value.clone(),
            full_value: self.full_value.clone(),
            data_json: self.data_json.clone(),
            color: self.color.clone(),
            confidence: self.confidence,
            min_zoom: self.min_zoom,
            max_zoom: self.max_zoom,
            is_visible: self.is_visible,
            image_asset_id: self.image_asset_id.clone(),
            icon_asset_id: self.icon_asset_id.clone(),
            source_note: self.source_note.clone(),
            created_by: self.created_by.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }

    fn as_value(&self) -> Value {
        let parsed_data = self
            .data_json
            .as_ref()
            .and_then(|v| serde_json::from_str::<Value>(v).ok());

        json!({
            "id": self.id,
            "region_id": self.region_id,
            "hint_type_id": self.hint_type_id,
            "hint_type_code": self.hint_type_code,
            "short_value": self.short_value,
            "full_value": self.full_value,
            "data_json": parsed_data,
            "color": self.color,
            "confidence": self.confidence,
            "min_zoom": self.min_zoom,
            "max_zoom": self.max_zoom,
            "is_visible": self.is_visible,
            "image_asset_id": self.image_asset_id,
            "icon_asset_id": self.icon_asset_id,
            "source_note": self.source_note,
            "created_by": self.created_by,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        })
    }
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
pub fn get_hint_counts(db: State<'_, DbState>) -> Result<HashMap<String, usize>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ht.code, COUNT(rh.id)
             FROM hint_type ht
             LEFT JOIN region_hint rh ON ht.id = rh.hint_type_id
             GROUP BY ht.code",
        )
        .map_err(|e| e.to_string())?;

    let mut counts = HashMap::new();
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
pub fn get_hints_by_region(
    db: State<'_, DbState>,
    region_id: String,
) -> Result<Vec<RegionHintInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.region_id, rh.hint_type_id, ht.code, rh.short_value, rh.full_value,
                    rh.data_json, rh.color, rh.confidence, rh.min_zoom, rh.max_zoom, rh.is_visible,
                    rh.image_asset_id, rh.icon_asset_id, rh.source_note, rh.created_by, rh.created_at, rh.updated_at
             FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE rh.region_id = ?1
             ORDER BY ht.sort_order, rh.sort_order, rh.created_at",
        )
        .map_err(|e| e.to_string())?;

    let hints = stmt
        .query_map([&region_id], hint_row_to_info)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(hints)
}

/// Get all hints for a given hint type code.
#[tauri::command]
pub fn get_hints_by_type(
    db: State<'_, DbState>,
    hint_type_code: String,
) -> Result<Vec<RegionHintInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.region_id, rh.hint_type_id, ht.code, rh.short_value, rh.full_value,
                    rh.data_json, rh.color, rh.confidence, rh.min_zoom, rh.max_zoom, rh.is_visible,
                    rh.image_asset_id, rh.icon_asset_id, rh.source_note, rh.created_by, rh.created_at, rh.updated_at
             FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = ?1
             ORDER BY rh.created_at",
        )
        .map_err(|e| e.to_string())?;

    let hints = stmt
        .query_map([&hint_type_code], hint_row_to_info)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(hints)
}

#[tauri::command]
pub fn create_hint(
    db: State<'_, DbState>,
    input: CreateHintInput,
) -> Result<RegionHintInfo, String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    create_hint_impl(&mut conn, input)
}

#[tauri::command]
pub fn update_hint(
    db: State<'_, DbState>,
    input: UpdateHintInput,
) -> Result<RegionHintInfo, String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    update_hint_impl(&mut conn, input)
}

#[tauri::command]
pub fn delete_hint(
    db: State<'_, DbState>,
    hint_id: String,
    created_by: Option<String>,
) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    delete_hint_impl(&mut conn, &hint_id, created_by)
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

fn create_hint_impl(conn: &mut Connection, input: CreateHintInput) -> Result<RegionHintInfo, String> {
    validate_region_exists(conn, &input.region_id)?;
    let hint_type = load_hint_type_meta(conn, &input.hint_type_code)?;

    let short_value = normalize_optional_text(input.short_value);
    let full_value = normalize_optional_text(input.full_value);
    let color = normalize_optional_text(input.color);
    let source_note = normalize_optional_text(input.source_note);
    let image_asset_id = normalize_optional_text(input.image_asset_id);
    let icon_asset_id = normalize_optional_text(input.icon_asset_id);
    let data_json = normalize_data_json(input.data_json)?;

    if let Some(color_value) = color.as_ref() {
        if !is_valid_hex_color(color_value) {
            return Err(format!("Invalid color '{}'. Expected #RRGGBB", color_value));
        }
    }

    validate_data_json(hint_type.schema_json.as_deref(), data_json.as_ref())?;

    let min_zoom = input.min_zoom.unwrap_or(0.0);
    let max_zoom = input.max_zoom.unwrap_or(22.0);
    let confidence = input.confidence.unwrap_or(1.0);
    validate_zoom_and_confidence(min_zoom, max_zoom, confidence)?;

    let is_visible = input.is_visible.unwrap_or(true);
    let created_by = normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());
    let data_json_str = data_json
        .as_ref()
        .map(|v| serde_json::to_string(v).map_err(|e| e.to_string()))
        .transpose()?;

    let hint_id = Uuid::new_v4().to_string();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO region_hint (
            id, region_id, hint_type_id, short_value, full_value, data_json, color,
            confidence, min_zoom, max_zoom, is_visible, image_asset_id, icon_asset_id,
            source_note, created_by
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7,
            ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, ?15
         )",
        rusqlite::params![
            hint_id,
            input.region_id,
            hint_type.id,
            short_value,
            full_value,
            data_json_str,
            color,
            confidence,
            min_zoom,
            max_zoom,
            if is_visible { 1 } else { 0 },
            image_asset_id,
            icon_asset_id,
            source_note,
            created_by,
        ],
    )
    .map_err(|e| e.to_string())?;

    let inserted = query_hint_by_id(&tx, &hint_id)?
        .ok_or_else(|| "Failed to load created hint".to_string())?;
    revision::log(
        &tx,
        "region_hint",
        &hint_id,
        "create",
        Some(&json!({ "after": inserted.as_value() })),
        &created_by,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(inserted.to_info())
}

fn update_hint_impl(conn: &mut Connection, input: UpdateHintInput) -> Result<RegionHintInfo, String> {
    let existing = query_hint_by_id(conn, &input.id)?
        .ok_or_else(|| format!("Hint '{}' not found", input.id))?;

    validate_region_exists(conn, &input.region_id)?;
    let hint_type = load_hint_type_meta(conn, &input.hint_type_code)?;

    let short_value = normalize_optional_text(input.short_value);
    let full_value = normalize_optional_text(input.full_value);
    let color = normalize_optional_text(input.color);
    let source_note = normalize_optional_text(input.source_note);
    let image_asset_id = normalize_optional_text(input.image_asset_id);
    let icon_asset_id = normalize_optional_text(input.icon_asset_id);
    let data_json = normalize_data_json(input.data_json)?;

    if let Some(color_value) = color.as_ref() {
        if !is_valid_hex_color(color_value) {
            return Err(format!("Invalid color '{}'. Expected #RRGGBB", color_value));
        }
    }

    validate_data_json(hint_type.schema_json.as_deref(), data_json.as_ref())?;

    let min_zoom = input.min_zoom.unwrap_or(existing.min_zoom);
    let max_zoom = input.max_zoom.unwrap_or(existing.max_zoom);
    let confidence = input.confidence.unwrap_or(existing.confidence);
    validate_zoom_and_confidence(min_zoom, max_zoom, confidence)?;

    let is_visible = input.is_visible.unwrap_or(existing.is_visible);
    let updated_by = normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());
    let data_json_str = data_json
        .as_ref()
        .map(|v| serde_json::to_string(v).map_err(|e| e.to_string()))
        .transpose()?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE region_hint
         SET region_id = ?1,
             hint_type_id = ?2,
             short_value = ?3,
             full_value = ?4,
             data_json = ?5,
             color = ?6,
             confidence = ?7,
             min_zoom = ?8,
             max_zoom = ?9,
             is_visible = ?10,
             image_asset_id = ?11,
             icon_asset_id = ?12,
             source_note = ?13,
             updated_at = datetime('now')
         WHERE id = ?14",
        rusqlite::params![
            input.region_id,
            hint_type.id,
            short_value,
            full_value,
            data_json_str,
            color,
            confidence,
            min_zoom,
            max_zoom,
            if is_visible { 1 } else { 0 },
            image_asset_id,
            icon_asset_id,
            source_note,
            input.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let updated = query_hint_by_id(&tx, &input.id)?
        .ok_or_else(|| "Failed to load updated hint".to_string())?;
    let diff = build_object_diff(&existing.as_value(), &updated.as_value());
    revision::log(
        &tx,
        "region_hint",
        &input.id,
        "update",
        Some(&diff),
        &updated_by,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(updated.to_info())
}

fn delete_hint_impl(
    conn: &mut Connection,
    hint_id: &str,
    created_by: Option<String>,
) -> Result<(), String> {
    let existing = query_hint_by_id(conn, hint_id)?
        .ok_or_else(|| format!("Hint '{}' not found", hint_id))?;
    let author = normalize_optional_text(created_by).unwrap_or_else(|| "user".to_string());

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM region_hint WHERE id = ?1", [hint_id])
        .map_err(|e| e.to_string())?;
    revision::log(
        &tx,
        "region_hint",
        hint_id,
        "delete",
        Some(&json!({ "before": existing.as_value() })),
        &author,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn hint_row_to_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<RegionHintInfo> {
    let is_visible: i64 = row.get(11)?;
    Ok(RegionHintInfo {
        id: row.get(0)?,
        region_id: row.get(1)?,
        hint_type_code: row.get(3)?,
        short_value: row.get(4)?,
        full_value: row.get(5)?,
        data_json: row.get(6)?,
        color: row.get(7)?,
        confidence: row.get(8)?,
        min_zoom: row.get(9)?,
        max_zoom: row.get(10)?,
        is_visible: is_visible != 0,
        image_asset_id: row.get(12)?,
        icon_asset_id: row.get(13)?,
        source_note: row.get(14)?,
        created_by: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn query_hint_by_id(conn: &Connection, hint_id: &str) -> Result<Option<HintRecord>, String> {
    conn.query_row(
        "SELECT rh.id, rh.region_id, rh.hint_type_id, ht.code, rh.short_value, rh.full_value,
                rh.data_json, rh.color, rh.confidence, rh.min_zoom, rh.max_zoom, rh.is_visible,
                rh.image_asset_id, rh.icon_asset_id, rh.source_note, rh.created_by, rh.created_at, rh.updated_at
         FROM region_hint rh
         JOIN hint_type ht ON rh.hint_type_id = ht.id
         WHERE rh.id = ?1",
        [hint_id],
        |row| {
            let is_visible: i64 = row.get(11)?;
            Ok(HintRecord {
                id: row.get(0)?,
                region_id: row.get(1)?,
                hint_type_id: row.get(2)?,
                hint_type_code: row.get(3)?,
                short_value: row.get(4)?,
                full_value: row.get(5)?,
                data_json: row.get(6)?,
                color: row.get(7)?,
                confidence: row.get(8)?,
                min_zoom: row.get(9)?,
                max_zoom: row.get(10)?,
                is_visible: is_visible != 0,
                image_asset_id: row.get(12)?,
                icon_asset_id: row.get(13)?,
                source_note: row.get(14)?,
                created_by: row.get(15)?,
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn validate_region_exists(conn: &Connection, region_id: &str) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM region WHERE id = ?1 AND is_active = 1",
            [region_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err(format!("Region '{}' not found or inactive", region_id));
    }
    Ok(())
}

fn load_hint_type_meta(conn: &Connection, hint_type_code: &str) -> Result<HintTypeMeta, String> {
    conn.query_row(
        "SELECT id, schema_json FROM hint_type WHERE code = ?1 AND is_active = 1",
        [hint_type_code],
        |row| {
            Ok(HintTypeMeta {
                id: row.get(0)?,
                schema_json: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Hint type '{}' not found or inactive", hint_type_code))
}

fn validate_zoom_and_confidence(min_zoom: f64, max_zoom: f64, confidence: f64) -> Result<(), String> {
    if min_zoom > max_zoom {
        return Err("min_zoom must be <= max_zoom".to_string());
    }
    if !(0.0..=1.0).contains(&confidence) {
        return Err("confidence must be between 0.0 and 1.0".to_string());
    }
    Ok(())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_data_json(value: Option<Value>) -> Result<Option<Value>, String> {
    match value {
        Some(Value::Null) => Ok(None),
        Some(Value::Object(map)) if map.is_empty() => Ok(None),
        Some(other) => Ok(Some(other)),
        None => Ok(None),
    }
}

fn is_valid_hex_color(color: &str) -> bool {
    let bytes = color.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return false;
    }
    bytes[1..].iter().all(|c| c.is_ascii_hexdigit())
}

fn validate_data_json(schema_json: Option<&str>, data_json: Option<&Value>) -> Result<(), String> {
    let Some(schema_json) = schema_json else {
        return Ok(());
    };

    let schema: Value = serde_json::from_str(schema_json)
        .map_err(|e| format!("Invalid hint_type.schema_json: {}", e))?;
    let schema_obj = schema
        .as_object()
        .ok_or_else(|| "schema_json must be a JSON object".to_string())?;

    let required_fields: Vec<String> = schema_obj
        .get("required")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let properties = schema_obj
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let data_obj = match data_json {
        Some(Value::Object(obj)) => obj,
        Some(_) => return Err("data_json must be a JSON object".to_string()),
        None => {
            if required_fields.is_empty() {
                return Ok(());
            }
            return Err(format!(
                "data_json is required (missing fields: {})",
                required_fields.join(", ")
            ));
        }
    };

    for field in required_fields {
        match data_obj.get(&field) {
            Some(v) if !v.is_null() => {}
            _ => return Err(format!("Missing required field '{}'", field)),
        }
    }

    for (field, field_schema) in properties {
        let Some(value) = data_obj.get(&field) else {
            continue;
        };

        if let Some(expected_type) = field_schema.get("type").and_then(Value::as_str) {
            if !json_type_matches(value, expected_type) {
                return Err(format!(
                    "Field '{}' must be of type '{}'",
                    field, expected_type
                ));
            }
        }

        if let Some(enum_values) = field_schema.get("enum").and_then(Value::as_array) {
            if !enum_values.iter().any(|allowed| allowed == value) {
                return Err(format!("Field '{}' has invalid enum value '{}'", field, value));
            }
        }
    }

    Ok(())
}

fn json_type_matches(value: &Value, expected_type: &str) -> bool {
    match expected_type {
        "string" => value.is_string(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "object" => value.is_object(),
        "array" => value.is_array(),
        "null" => value.is_null(),
        _ => true,
    }
}

fn build_object_diff(before: &Value, after: &Value) -> Value {
    let before_obj = before.as_object().cloned().unwrap_or_default();
    let after_obj = after.as_object().cloned().unwrap_or_default();

    let mut keys = BTreeSet::new();
    keys.extend(before_obj.keys().cloned());
    keys.extend(after_obj.keys().cloned());

    let mut diff = serde_json::Map::new();
    for key in keys {
        let old_value = before_obj.get(&key).cloned().unwrap_or(Value::Null);
        let new_value = after_obj.get(&key).cloned().unwrap_or(Value::Null);
        if old_value != new_value {
            diff.insert(key, json!({ "old": old_value, "new": new_value }));
        }
    }

    Value::Object(diff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;
    use crate::import::geodata;
    use crate::seed::hint_types;

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

        let created = create_hint_impl(
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

        let created = create_hint_impl(
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

        let updated = update_hint_impl(
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

        let created = create_hint_impl(
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

        delete_hint_impl(&mut conn, &created.id, Some("user".to_string())).unwrap();

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

        let result = create_hint_impl(
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
