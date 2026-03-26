use super::error::{internal_error, ApiResult};
use super::models::{HintTypeDto, ListResponse};
use crate::agent::AgentApiContext;
use crate::commands::hints::repository as hint_repository;
use axum::extract::State;
use axum::Json;
use serde_json::Value;

pub async fn get_hint_types(
    State(state): State<AgentApiContext>,
) -> ApiResult<ListResponse<HintTypeDto>> {
    let conn = state.pool.get().map_err(internal_error)?;
    let items = hint_repository::list_hint_types(&conn)
        .map_err(internal_error)?
        .into_iter()
        .map(|item| HintTypeDto {
            id: item.id,
            code: item.code,
            title: item.title,
            display_family: item.display_family,
            schema_json: item
                .schema_json
                .and_then(|raw| serde_json::from_str::<Value>(&raw).ok()),
            sort_order: item.sort_order,
            is_active: item.is_active,
        })
        .collect();

    Ok(Json(ListResponse { items }))
}
