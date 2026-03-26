use super::error::{internal_error, ApiError, ApiResult};
use super::helpers::{emit_data_changed, non_empty_opt};
use super::models::{
    BatchHintsPayload, BatchHintsResponse, ByCountryPayload, CreateHintPayload, HintDto,
    UpdateHintPayload,
};
use crate::agent::AgentApiContext;
use crate::commands::hints::{
    models::RegionHintInfo, repository as hint_repository, service as hint_service,
    validator as hint_validator,
};
use crate::services::revision;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;
use uuid::Uuid;

pub async fn create_hint(
    State(state): State<AgentApiContext>,
    Json(payload): Json<CreateHintPayload>,
) -> Result<impl IntoResponse, ApiError> {
    let mut conn = state.pool.get().map_err(internal_error)?;
    let created = hint_service::create_hint(&mut conn, payload.to_create_input())
        .map_err(ApiError::validation)?;

    emit_data_changed(&state, vec![created.hint_type_code.clone()]);
    Ok((StatusCode::CREATED, Json(HintDto::from(created))))
}

pub async fn update_hint(
    State(state): State<AgentApiContext>,
    Path(hint_id): Path<String>,
    Json(payload): Json<UpdateHintPayload>,
) -> ApiResult<HintDto> {
    let mut conn = state.pool.get().map_err(internal_error)?;
    let updated = hint_service::update_hint(&mut conn, payload.to_update_input(hint_id))
        .map_err(ApiError::validation)?;

    emit_data_changed(&state, vec![updated.hint_type_code.clone()]);
    Ok(Json(HintDto::from(updated)))
}

pub async fn delete_hint(
    State(state): State<AgentApiContext>,
    Path(hint_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let mut conn = state.pool.get().map_err(internal_error)?;

    let hint_type_code = hint_repository::query_hint_by_id(&conn, &hint_id)
        .map_err(internal_error)?
        .map(|h| h.hint_type_code);

    hint_service::delete_hint(&mut conn, &hint_id, Some("agent".to_string()))
        .map_err(ApiError::validation)?;

    if let Some(code) = hint_type_code {
        emit_data_changed(&state, vec![code]);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_hints_batch(
    State(state): State<AgentApiContext>,
    Json(payload): Json<BatchHintsPayload>,
) -> ApiResult<BatchHintsResponse> {
    let mut conn = state.pool.get().map_err(internal_error)?;
    let (result, hint_type_codes) = batch_create_hints_in_conn(&mut conn, payload)?;
    emit_data_changed(&state, hint_type_codes);
    Ok(Json(result))
}

pub async fn create_hints_by_country(
    State(state): State<AgentApiContext>,
    Json(payload): Json<ByCountryPayload>,
) -> ApiResult<BatchHintsResponse> {
    let mut conn = state.pool.get().map_err(internal_error)?;
    let (result, hint_type_codes) = create_hints_by_country_in_conn(&mut conn, payload)?;
    emit_data_changed(&state, hint_type_codes);
    Ok(Json(result))
}

fn batch_create_hints_in_conn(
    conn: &mut rusqlite::Connection,
    payload: BatchHintsPayload,
) -> Result<(BatchHintsResponse, Vec<String>), ApiError> {
    if payload.hints.is_empty() {
        return Err(ApiError::validation("hints array must not be empty"));
    }
    if payload.hints.len() > 10_000 {
        return Err(ApiError::validation(
            "hints array exceeds max size (10_000)",
        ));
    }

    let tx = conn.unchecked_transaction().map_err(internal_error)?;

    let mut ids = Vec::with_capacity(payload.hints.len());
    let mut hint_type_codes = Vec::with_capacity(payload.hints.len());
    for (index, hint) in payload.hints.iter().enumerate() {
        let created = create_hint_in_connection(&tx, hint).map_err(|message| {
            ApiError::validation_at(format!("hints[{index}] {message}"), index)
        })?;
        ids.push(created.id);
        hint_type_codes.push(created.hint_type_code);
    }

    tx.commit().map_err(internal_error)?;
    Ok((
        BatchHintsResponse {
            created: ids.len(),
            ids,
        },
        hint_type_codes,
    ))
}

fn create_hints_by_country_in_conn(
    conn: &mut rusqlite::Connection,
    payload: ByCountryPayload,
) -> Result<(BatchHintsResponse, Vec<String>), ApiError> {
    let country_code = non_empty_opt(Some(payload.country_code.clone()))
        .ok_or_else(|| ApiError::validation("country_code must not be empty"))?;
    let region_level = non_empty_opt(Some(payload.region_level.clone()))
        .ok_or_else(|| ApiError::validation("region_level must not be empty"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id
             FROM region
             WHERE country_code = ?1
               AND region_level = ?2
               AND is_active = 1
             ORDER BY name",
        )
        .map_err(internal_error)?;

    let region_ids: Vec<String> = stmt
        .query_map([country_code.as_str(), region_level.as_str()], |row| {
            row.get(0)
        })
        .map_err(internal_error)?
        .filter_map(Result::ok)
        .collect();

    if region_ids.is_empty() {
        return Err(ApiError::not_found(format!(
            "No regions found for country_code='{country_code}' and region_level='{region_level}'"
        )));
    }

    let tx = conn.unchecked_transaction().map_err(internal_error)?;
    let mut ids = Vec::with_capacity(region_ids.len());
    let mut hint_type_codes = Vec::with_capacity(region_ids.len());

    for (index, region_id) in region_ids.iter().enumerate() {
        let hint = CreateHintPayload {
            region_id: region_id.clone(),
            hint_type_code: payload.hint_type_code.clone(),
            short_value: payload.short_value.clone(),
            full_value: payload.full_value.clone(),
            data_json: payload.data_json.clone(),
            color: payload.color.clone(),
            confidence: payload.confidence,
            min_zoom: payload.min_zoom,
            max_zoom: payload.max_zoom,
            is_visible: payload.is_visible,
            image_asset_id: payload.image_asset_id.clone(),
            icon_asset_id: payload.icon_asset_id.clone(),
            source_note: payload.source_note.clone(),
        };

        let created = create_hint_in_connection(&tx, &hint).map_err(|message| {
            ApiError::validation_at(format!("regions[{index}] {message}"), index)
        })?;
        ids.push(created.id);
        hint_type_codes.push(created.hint_type_code);
    }

    tx.commit().map_err(internal_error)?;
    Ok((
        BatchHintsResponse {
            created: ids.len(),
            ids,
        },
        hint_type_codes,
    ))
}

fn create_hint_in_connection(
    conn: &rusqlite::Connection,
    payload: &CreateHintPayload,
) -> Result<RegionHintInfo, String> {
    hint_repository::ensure_region_is_active(conn, &payload.region_id)?;
    let hint_type = hint_repository::load_hint_type_meta(conn, &payload.hint_type_code)?;

    let short_value = hint_validator::normalize_optional_text(payload.short_value.clone());
    let full_value = hint_validator::normalize_optional_text(payload.full_value.clone());
    let color = hint_validator::normalize_optional_text(payload.color.clone());
    let source_note = hint_validator::normalize_optional_text(payload.source_note.clone());
    let image_asset_id = hint_validator::normalize_optional_text(payload.image_asset_id.clone());
    let icon_asset_id = hint_validator::normalize_optional_text(payload.icon_asset_id.clone());
    let data_json = hint_validator::normalize_data_json(payload.data_json.clone());

    hint_validator::validate_hex_color(color.as_deref())?;
    hint_validator::validate_data_json(hint_type.schema_json.as_deref(), data_json.as_ref())?;

    let min_zoom = payload.min_zoom.unwrap_or(0.0);
    let max_zoom = payload.max_zoom.unwrap_or(22.0);
    let confidence = payload.confidence.unwrap_or(1.0);
    hint_validator::validate_zoom_and_confidence(min_zoom, max_zoom, confidence)?;

    let is_visible = payload.is_visible.unwrap_or(true);
    let data_json_str = data_json
        .as_ref()
        .map(|value| serde_json::to_string(value).map_err(|e| e.to_string()))
        .transpose()?;

    let hint_id = Uuid::new_v4().to_string();
    conn.execute(
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
            payload.region_id,
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
            "agent",
        ],
    )
    .map_err(|e| e.to_string())?;

    let inserted = hint_repository::query_hint_by_id(conn, &hint_id)?
        .ok_or_else(|| "Failed to load created hint".to_string())?;

    revision::log(
        conn,
        "region_hint",
        &hint_id,
        "create",
        Some(&json!({ "after": inserted.as_value() })),
        "agent",
        None,
    )?;

    Ok(inserted.to_info())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrations, DbState};
    use crate::seed;
    use rusqlite::Connection;
    use std::path::{Path, PathBuf};
    use std::time::{Duration, Instant};
    use uuid::Uuid;

    fn setup_conn() -> Connection {
        let db = DbState::new_in_memory().unwrap();
        let conn = db.conn.into_inner().unwrap();
        seed::hint_types::seed(&conn).unwrap();

        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'country-in', 'India', 'India', 'IN', 'country', 'countries:IN', 78.0, 22.0, 1
             )",
            [],
        )
        .unwrap();

        conn
    }

    fn setup_file_conn() -> (Connection, PathBuf) {
        let db_path = std::env::temp_dir().join(format!("guess-map-agent-{}.db", Uuid::new_v4()));
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
        )
        .unwrap();
        migrations::run_all(&conn).unwrap();
        seed::hint_types::seed(&conn).unwrap();

        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'country-in', 'India', 'India', 'IN', 'country', 'countries:IN', 78.0, 22.0, 1
             )",
            [],
        )
        .unwrap();

        let admin1 = [
            ("admin1-in-ka", "Karnataka"),
            ("admin1-in-kl", "Kerala"),
            ("admin1-in-ga", "Goa"),
        ];
        for (id, name) in admin1 {
            conn.execute(
                "INSERT INTO region (
                    id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat, is_active
                 ) VALUES (
                    ?1, ?2, ?2, 'IN', 'admin1', 'country-in', ?3, 75.0, 14.0, 1
                 )",
                rusqlite::params![id, name, format!("admin1:IN:{}", id)],
            )
            .unwrap();
        }

        for i in 1..=194 {
            let id = format!("country-{i:03}");
            let cc = format!("{:02}", i % 100);
            let name = format!("Country {i}");
            let geometry_ref = format!("countries:{id}");
            conn.execute(
                "INSERT INTO region (
                    id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active
                 ) VALUES (
                    ?1, ?2, ?2, ?3, 'country', ?4, 0.0, 0.0, 1
                 )",
                rusqlite::params![id, name, cc, geometry_ref],
            )
            .unwrap();
        }

        (conn, db_path)
    }

    fn load_country_ids(db_path: &Path, limit: usize) -> Vec<String> {
        let conn = Connection::open(db_path).unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id FROM region
                 WHERE region_level='country' AND is_active=1
                 ORDER BY id
                 LIMIT ?1",
            )
            .unwrap();

        stmt.query_map([limit as i64], |row| row.get(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect()
    }

    #[test]
    fn test_create_hint_in_connection_validates_schema() {
        let conn = setup_conn();
        let payload = CreateHintPayload {
            region_id: "country-in".to_string(),
            hint_type_code: "driving_side".to_string(),
            short_value: Some("Right".to_string()),
            full_value: None,
            data_json: Some(json!({ "side": "invalid" })),
            color: Some("#112233".to_string()),
            confidence: Some(1.0),
            min_zoom: None,
            max_zoom: None,
            is_visible: Some(true),
            image_asset_id: None,
            icon_asset_id: None,
            source_note: None,
        };

        assert!(create_hint_in_connection(&conn, &payload).is_err());
    }

    #[test]
    fn test_batch_transaction_is_all_or_nothing() {
        let conn = setup_conn();

        let valid = CreateHintPayload {
            region_id: "country-in".to_string(),
            hint_type_code: "note".to_string(),
            short_value: Some("Use local clues".to_string()),
            full_value: None,
            data_json: None,
            color: Some("#3366CC".to_string()),
            confidence: Some(0.9),
            min_zoom: None,
            max_zoom: None,
            is_visible: Some(true),
            image_asset_id: None,
            icon_asset_id: None,
            source_note: None,
        };

        let invalid = CreateHintPayload {
            region_id: "country-in".to_string(),
            hint_type_code: "driving_side".to_string(),
            short_value: Some("Right".to_string()),
            full_value: None,
            data_json: Some(json!({ "side": "WRONG" })),
            color: Some("#AA0000".to_string()),
            confidence: Some(1.0),
            min_zoom: None,
            max_zoom: None,
            is_visible: Some(true),
            image_asset_id: None,
            icon_asset_id: None,
            source_note: None,
        };

        let tx = conn.unchecked_transaction().unwrap();
        assert!(create_hint_in_connection(&tx, &valid).is_ok());
        assert!(create_hint_in_connection(&tx, &invalid).is_err());
        drop(tx); // rollback

        let hint_count: usize = conn
            .query_row("SELECT COUNT(*) FROM region_hint", [], |row| row.get(0))
            .unwrap();
        assert_eq!(hint_count, 0);

        let rev_count: usize = conn
            .query_row("SELECT COUNT(*) FROM revision_log", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rev_count, 0);
    }

    #[test]
    fn test_batch_195_under_5_seconds() {
        let (mut conn, db_path) = setup_file_conn();
        let country_ids = load_country_ids(&db_path, 195);
        assert_eq!(country_ids.len(), 195);

        let payload = BatchHintsPayload {
            hints: country_ids
                .into_iter()
                .map(|region_id| CreateHintPayload {
                    region_id,
                    hint_type_code: "driving_side".to_string(),
                    short_value: Some("Right".to_string()),
                    full_value: None,
                    data_json: Some(json!({ "side": "right" })),
                    color: None,
                    confidence: Some(1.0),
                    min_zoom: None,
                    max_zoom: None,
                    is_visible: Some(true),
                    image_asset_id: None,
                    icon_asset_id: None,
                    source_note: Some("test".to_string()),
                })
                .collect(),
        };

        let started = Instant::now();
        let (result, _) = batch_create_hints_in_conn(&mut conn, payload).unwrap();
        let elapsed = started.elapsed();

        assert_eq!(result.created, 195);
        assert!(elapsed < Duration::from_secs(5));
    }

    #[test]
    fn test_by_country_creates_all_admin1_regions() {
        let (mut conn, _) = setup_file_conn();

        let payload = ByCountryPayload {
            country_code: "IN".to_string(),
            region_level: "admin1".to_string(),
            hint_type_code: "driving_side".to_string(),
            short_value: Some("Left".to_string()),
            full_value: None,
            data_json: Some(json!({ "side": "left" })),
            color: None,
            confidence: Some(1.0),
            min_zoom: None,
            max_zoom: None,
            is_visible: Some(true),
            image_asset_id: None,
            icon_asset_id: None,
            source_note: None,
        };

        let (result, _) = create_hints_by_country_in_conn(&mut conn, payload).unwrap();
        assert_eq!(result.created, 3);
    }

    #[test]
    fn test_concurrent_ui_write_and_batch_succeed_with_wal() {
        let (mut conn, db_path) = setup_file_conn();
        let country_ids = load_country_ids(&db_path, 30);

        let worker_db_path = db_path.clone();
        let worker = std::thread::spawn(move || {
            let worker_conn = Connection::open(worker_db_path).unwrap();
            worker_conn
                .execute_batch(
                    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
                )
                .unwrap();

            let hint_type_id: String = worker_conn
                .query_row("SELECT id FROM hint_type WHERE code='note'", [], |row| {
                    row.get(0)
                })
                .unwrap();

            let tx = worker_conn.unchecked_transaction().unwrap();
            tx.execute(
                "INSERT INTO region_hint (
                    id, region_id, hint_type_id, short_value, created_by, confidence, min_zoom, max_zoom, is_visible
                 ) VALUES (
                    ?1, 'country-in', ?2, 'UI note', 'user', 1.0, 0.0, 22.0, 1
                 )",
                rusqlite::params![Uuid::new_v4().to_string(), hint_type_id],
            )
            .unwrap();
            std::thread::sleep(Duration::from_millis(120));
            tx.commit().unwrap();
        });

        let payload = BatchHintsPayload {
            hints: country_ids
                .into_iter()
                .map(|region_id| CreateHintPayload {
                    region_id,
                    hint_type_code: "driving_side".to_string(),
                    short_value: Some("Right".to_string()),
                    full_value: None,
                    data_json: Some(json!({ "side": "right" })),
                    color: None,
                    confidence: Some(1.0),
                    min_zoom: None,
                    max_zoom: None,
                    is_visible: Some(true),
                    image_asset_id: None,
                    icon_asset_id: None,
                    source_note: None,
                })
                .collect(),
        };

        let (result, _) = batch_create_hints_in_conn(&mut conn, payload).unwrap();
        assert_eq!(result.created, 30);

        worker.join().unwrap();
    }
}
