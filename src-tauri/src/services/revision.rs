use rusqlite::Connection;
use serde_json::Value;
use uuid::Uuid;

pub fn log(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    diff_json: Option<&Value>,
    created_by: &str,
    comment: Option<&str>,
) -> Result<(), String> {
    let diff_str = match diff_json {
        Some(value) => Some(serde_json::to_string(value).map_err(|e| e.to_string())?),
        None => None,
    };

    conn.execute(
        "INSERT INTO revision_log (id, entity_type, entity_id, action, diff_json, created_by, comment)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            Uuid::new_v4().to_string(),
            entity_type,
            entity_id,
            action,
            diff_str,
            created_by,
            comment,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
