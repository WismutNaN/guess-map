use super::error::ApiError;
use crate::agent::AgentApiContext;
use crate::compiler;
use rusqlite::OptionalExtension;
use serde_json::json;
use std::collections::HashSet;
use tauri::Emitter;

pub fn compile_hint_type(
    conn: &rusqlite::Connection,
    hint_type_code: &str,
) -> Result<(), ApiError> {
    let display_family: Option<String> = conn
        .query_row(
            "SELECT display_family FROM hint_type WHERE code = ?1 AND is_active = 1",
            [hint_type_code],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let Some(display_family) = display_family else {
        return Err(ApiError::validation("hint_type not found or inactive"));
    };

    match display_family.as_str() {
        "polygon_fill" => {
            compiler::compile_polygon_enrichment(conn, hint_type_code)
                .map_err(ApiError::validation)?;
        }
        "line" => {
            compiler::compile_line_layer(conn, hint_type_code).map_err(ApiError::validation)?;
        }
        _ => {
            compiler::compile_point_layer(conn, hint_type_code).map_err(ApiError::validation)?;
        }
    }

    Ok(())
}

pub fn emit_data_changed(state: &AgentApiContext, hint_type_codes: Vec<String>) {
    let mut seen = HashSet::new();
    let codes: Vec<String> = hint_type_codes
        .into_iter()
        .filter(|code| !code.trim().is_empty())
        .filter(|code| seen.insert(code.clone()))
        .collect();

    if codes.is_empty() {
        return;
    }

    if let Some(app_handle) = &state.app_handle {
        let _ = app_handle.emit(
            "agent-api:data-changed",
            json!({
                "hint_type_codes": codes,
                "source": "agent-api"
            }),
        );
    }
}

pub fn non_empty_opt(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}
