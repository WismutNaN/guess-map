use super::error::{internal_error, ApiResult};
use super::models::StatsResponse;
use crate::agent::AgentApiContext;
use axum::extract::State;
use axum::Json;
use std::collections::HashMap;

pub async fn get_stats(State(state): State<AgentApiContext>) -> ApiResult<StatsResponse> {
    let conn = state.pool.get().map_err(internal_error)?;

    let regions_total: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region WHERE is_active = 1",
            [],
            |row| row.get(0),
        )
        .map_err(internal_error)?;

    let regions_with_hints: usize = conn
        .query_row(
            "SELECT COUNT(DISTINCT rh.region_id)
             FROM region_hint rh
             JOIN region r ON rh.region_id = r.id
             WHERE r.is_active = 1",
            [],
            |row| row.get(0),
        )
        .map_err(internal_error)?;

    let hints_total: usize = conn
        .query_row("SELECT COUNT(*) FROM region_hint", [], |row| row.get(0))
        .map_err(internal_error)?;

    let hints_by_type = {
        let mut map = HashMap::new();
        let mut stmt = conn
            .prepare(
                "SELECT ht.code, COUNT(rh.id)
                 FROM hint_type ht
                 LEFT JOIN region_hint rh ON rh.hint_type_id = ht.id
                 GROUP BY ht.code",
            )
            .map_err(internal_error)?;

        let rows = stmt
            .query_map([], |row| {
                let code: String = row.get(0)?;
                let count: usize = row.get(1)?;
                Ok((code, count))
            })
            .map_err(internal_error)?;

        for row in rows.flatten() {
            map.insert(row.0, row.1);
        }
        map
    };

    let hints_by_author = {
        let mut map = HashMap::new();
        let mut stmt = conn
            .prepare(
                "SELECT created_by, COUNT(*)
                 FROM region_hint
                 GROUP BY created_by",
            )
            .map_err(internal_error)?;

        let rows = stmt
            .query_map([], |row| {
                let author: String = row.get(0)?;
                let count: usize = row.get(1)?;
                Ok((author, count))
            })
            .map_err(internal_error)?;

        for row in rows.flatten() {
            map.insert(row.0, row.1);
        }
        map
    };

    Ok(Json(StatsResponse {
        regions_total,
        regions_with_hints,
        hints_total,
        hints_by_type,
        hints_by_author,
    }))
}
