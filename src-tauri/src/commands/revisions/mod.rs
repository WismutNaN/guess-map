use crate::db::DbState;
use rusqlite::params_from_iter;
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevisionLogFilterInput {
    pub entity_type: Option<String>,
    pub created_by: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct RevisionLogEntry {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub diff_json: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub comment: Option<String>,
}

#[tauri::command]
pub fn list_revision_logs(
    db: State<'_, DbState>,
    filter: Option<RevisionLogFilterInput>,
) -> Result<Vec<RevisionLogEntry>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let filter = filter.unwrap_or_default();
    let limit = filter.limit.unwrap_or(200).clamp(1, 5000) as i64;

    let mut sql = String::from(
        "SELECT id, entity_type, entity_id, action, diff_json, created_by, created_at, comment
         FROM revision_log
         WHERE 1 = 1",
    );
    let mut params: Vec<Value> = Vec::new();

    if let Some(value) = normalize_optional(filter.entity_type) {
        sql.push_str(" AND entity_type = ?");
        params.push(Value::from(value));
    }
    if let Some(value) = normalize_optional(filter.created_by) {
        sql.push_str(" AND created_by = ?");
        params.push(Value::from(value));
    }
    if let Some(value) = normalize_optional(filter.date_from) {
        sql.push_str(" AND created_at >= ?");
        params.push(Value::from(value));
    }
    if let Some(value) = normalize_optional(filter.date_to) {
        sql.push_str(" AND created_at <= ?");
        params.push(Value::from(value));
    }

    sql.push_str(" ORDER BY created_at DESC LIMIT ?");
    params.push(Value::from(limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(params), |row| {
            Ok(RevisionLogEntry {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
                action: row.get(3)?,
                diff_json: row.get(4)?,
                created_by: row.get(5)?,
                created_at: row.get(6)?,
                comment: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    Ok(rows)
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}
