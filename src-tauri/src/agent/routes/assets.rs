use super::error::{internal_error, ApiError, ApiResult};
use crate::agent::AgentApiContext;
use crate::commands::asset::{self, AssetInfo, UploadAssetInput};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use base64::Engine;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Deserialize)]
pub struct UploadAssetPayload {
    /// Original file name (e.g. "sign_de_01.png") — used for extension detection
    pub file_name: String,
    /// Base64-encoded file content
    pub data: String,
    /// Asset kind: flag, sample, icon, thumbnail, photo (default: "sample")
    pub kind: Option<String>,
    /// Optional text description
    pub caption: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AssetDto {
    pub id: String,
    pub file_path: String,
    pub kind: String,
    pub mime_type: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub caption: Option<String>,
}

impl From<AssetInfo> for AssetDto {
    fn from(a: AssetInfo) -> Self {
        Self {
            id: a.id,
            file_path: a.file_path,
            kind: a.kind,
            mime_type: a.mime_type,
            width: a.width,
            height: a.height,
            caption: a.caption,
        }
    }
}

/// POST /api/assets — upload an image (base64-encoded)
pub async fn upload_asset(
    State(state): State<AgentApiContext>,
    Json(payload): Json<UploadAssetPayload>,
) -> Result<impl IntoResponse, ApiError> {
    if payload.file_name.trim().is_empty() {
        return Err(ApiError::validation("file_name must not be empty"));
    }
    if payload.data.trim().is_empty() {
        return Err(ApiError::validation("data must not be empty"));
    }

    // Decode base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.data.trim())
        .or_else(|_| {
            // Also try URL-safe base64
            base64::engine::general_purpose::URL_SAFE
                .decode(payload.data.trim())
        })
        .map_err(|e| ApiError::validation(format!("Invalid base64 data: {}", e)))?;

    if bytes.is_empty() {
        return Err(ApiError::validation("Decoded data is empty"));
    }

    // Get assets directory from app handle
    let assets_dir = state
        .app_handle
        .as_ref()
        .ok_or_else(|| ApiError::internal("No app handle available"))?
        .path()
        .app_data_dir()
        .map_err(|e| ApiError::internal(format!("Cannot resolve app data dir: {}", e)))?
        .join("assets");

    let mut conn = state.pool.get().map_err(internal_error)?;

    let input = UploadAssetInput {
        file_name: payload.file_name,
        bytes,
        kind: payload.kind,
        caption: payload.caption,
        created_by: Some("agent".to_string()),
    };

    let asset = asset::service::save_asset(&mut conn, &assets_dir, input)
        .map_err(ApiError::validation)?;

    Ok((StatusCode::CREATED, Json(AssetDto::from(asset))))
}

/// GET /api/assets/:id — get asset metadata by id
pub async fn get_asset(
    State(state): State<AgentApiContext>,
    Path(asset_id): Path<String>,
) -> ApiResult<AssetDto> {
    let conn = state.pool.get().map_err(internal_error)?;

    let row = conn
        .query_row(
            "SELECT id, file_path, kind, mime_type, width, height, caption
             FROM asset WHERE id = ?1",
            [&asset_id],
            |row| {
                Ok(AssetDto {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    kind: row.get(2)?,
                    mime_type: row.get(3)?,
                    width: row.get(4)?,
                    height: row.get(5)?,
                    caption: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(internal_error)?;

    match row {
        Some(asset) => Ok(Json(asset)),
        None => Err(ApiError::not_found(format!(
            "Asset '{}' not found",
            asset_id
        ))),
    }
}
