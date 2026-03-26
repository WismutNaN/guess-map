use super::error::{internal_error, ApiError, ApiResult};
use super::helpers::{compile_hint_type, emit_data_changed};
use super::models::{CompileLayersPayload, CompileLayersResponse};
use crate::agent::AgentApiContext;
use axum::body::Bytes;
use axum::extract::State;
use axum::Json;
use std::time::Instant;

pub async fn compile_layers(
    State(state): State<AgentApiContext>,
    body: Bytes,
) -> ApiResult<CompileLayersResponse> {
    let payload = if body.is_empty() {
        CompileLayersPayload {
            hint_type_codes: None,
        }
    } else {
        serde_json::from_slice::<CompileLayersPayload>(&body)
            .map_err(|e| ApiError::validation(format!("Invalid JSON: {e}")))?
    };

    let conn = state.pool.get().map_err(internal_error)?;

    let hint_type_codes = match payload.hint_type_codes {
        Some(codes) if !codes.is_empty() => codes,
        _ => {
            let mut stmt = conn
                .prepare("SELECT code FROM hint_type WHERE is_active = 1 ORDER BY sort_order")
                .map_err(internal_error)?;
            let rows = stmt
                .query_map([], |row| row.get(0))
                .map_err(internal_error)?;
            rows.filter_map(Result::ok).collect()
        }
    };

    let started = Instant::now();
    for code in &hint_type_codes {
        compile_hint_type(&conn, code)?;
    }
    let duration_ms = started.elapsed().as_millis();

    emit_data_changed(&state, hint_type_codes.clone());

    Ok(Json(CompileLayersResponse {
        compiled: hint_type_codes,
        duration_ms,
    }))
}
