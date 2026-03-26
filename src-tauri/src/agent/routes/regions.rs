use super::error::{internal_error, ApiError, ApiResult};
use super::helpers::non_empty_opt;
use super::models::{
    HintDto, ListResponse, PagedResponse, RegionDto, RegionWithHintsDto, RegionsQuery,
};
use crate::agent::AgentApiContext;
use crate::commands::hints::repository as hint_repository;
use crate::commands::regions::repository as region_repository;
use axum::extract::{Path, Query, State};
use axum::Json;
use rusqlite::types::Value as SqlValue;

pub async fn get_regions(
    State(state): State<AgentApiContext>,
    Query(query): Query<RegionsQuery>,
) -> ApiResult<PagedResponse<RegionDto>> {
    let conn = state.pool.get().map_err(internal_error)?;
    let result = list_regions_in_conn(&conn, query)?;
    Ok(Json(result))
}

fn list_regions_in_conn(
    conn: &rusqlite::Connection,
    query: RegionsQuery,
) -> Result<PagedResponse<RegionDto>, ApiError> {
    let mut where_parts = vec!["is_active = 1".to_string()];
    let mut params: Vec<SqlValue> = Vec::new();

    if let Some(country_code) = non_empty_opt(query.country_code) {
        where_parts.push("country_code = ?".to_string());
        params.push(SqlValue::from(country_code));
    }
    if let Some(region_level) = non_empty_opt(query.region_level) {
        where_parts.push("region_level = ?".to_string());
        params.push(SqlValue::from(region_level));
    }
    if let Some(parent_id) = non_empty_opt(query.parent_id) {
        where_parts.push("parent_id = ?".to_string());
        params.push(SqlValue::from(parent_id));
    }
    if let Some(search) = non_empty_opt(query.search) {
        let pattern = format!("%{}%", search);
        where_parts.push("(name LIKE ? OR name_en LIKE ? OR country_code LIKE ?)".to_string());
        params.push(SqlValue::from(pattern.clone()));
        params.push(SqlValue::from(pattern.clone()));
        params.push(SqlValue::from(pattern));
    }

    let limit = query.limit.unwrap_or(200).clamp(1, 2000);
    let offset = query.offset.unwrap_or(0);
    let where_sql = where_parts.join(" AND ");

    let count_sql = format!("SELECT COUNT(*) FROM region WHERE {where_sql}");
    let total: usize = conn
        .query_row(
            &count_sql,
            rusqlite::params_from_iter(params.iter()),
            |row| row.get(0),
        )
        .map_err(internal_error)?;

    let mut list_params = params.clone();
    list_params.push(SqlValue::from(limit as i64));
    list_params.push(SqlValue::from(offset as i64));

    let list_sql = format!(
        "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
         FROM region
         WHERE {where_sql}
         ORDER BY
            CASE region_level
              WHEN 'country' THEN 0
              WHEN 'admin1' THEN 1
              WHEN 'admin2' THEN 2
              WHEN 'theme_region' THEN 3
              WHEN 'route' THEN 4
              ELSE 5
            END,
            name
         LIMIT ? OFFSET ?"
    );

    let mut stmt = conn.prepare(&list_sql).map_err(internal_error)?;
    let items = stmt
        .query_map(rusqlite::params_from_iter(list_params.iter()), |row| {
            Ok(RegionDto {
                id: row.get(0)?,
                name: row.get(1)?,
                name_en: row.get(2)?,
                country_code: row.get(3)?,
                region_level: row.get(4)?,
                geometry_ref: row.get(5)?,
                anchor_lng: row.get(6)?,
                anchor_lat: row.get(7)?,
            })
        })
        .map_err(internal_error)?
        .filter_map(Result::ok)
        .collect();

    Ok(PagedResponse { items, total })
}

pub async fn get_region(
    State(state): State<AgentApiContext>,
    Path(region_id): Path<String>,
) -> ApiResult<RegionWithHintsDto> {
    let conn = state.pool.get().map_err(internal_error)?;

    let region = region_repository::get_region_by_id(&conn, &region_id)
        .map_err(internal_error)?
        .ok_or_else(|| ApiError::not_found(format!("Region '{region_id}' not found")))?;

    let hints = hint_repository::list_hints_by_region(&conn, &region_id)
        .map_err(internal_error)?
        .into_iter()
        .map(HintDto::from)
        .collect();

    Ok(Json(RegionWithHintsDto {
        region: RegionDto::from(region),
        hints,
    }))
}

pub async fn get_region_hints(
    State(state): State<AgentApiContext>,
    Path(region_id): Path<String>,
) -> ApiResult<ListResponse<HintDto>> {
    let conn = state.pool.get().map_err(internal_error)?;

    let items = hint_repository::list_hints_by_region(&conn, &region_id)
        .map_err(internal_error)?
        .into_iter()
        .map(HintDto::from)
        .collect();

    Ok(Json(ListResponse { items }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;

    fn setup_conn() -> rusqlite::Connection {
        let db = DbState::new_in_memory().unwrap();
        let conn = db.conn.into_inner().unwrap();

        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'country-in', 'India', 'India', 'IN', 'country', 'countries:IN', 78.0, 22.0, 1
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'admin1-in-ka', 'Karnataka', 'Karnataka', 'IN', 'admin1', 'country-in', 'admin1:IN-KA', 75.0, 14.0, 1
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'admin1-in-kl', 'Kerala', 'Kerala', 'IN', 'admin1', 'country-in', 'admin1:IN-KL', 76.0, 10.0, 1
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO region (
                id, name, name_en, country_code, region_level, parent_id, geometry_ref, anchor_lng, anchor_lat, is_active
             ) VALUES (
                'admin1-in-ga', 'Goa', 'Goa', 'IN', 'admin1', 'country-in', 'admin1:IN-GA', 74.0, 15.0, 1
             )",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_list_regions_filter_country_and_level() {
        let conn = setup_conn();
        let result = list_regions_in_conn(
            &conn,
            RegionsQuery {
                country_code: Some("IN".to_string()),
                region_level: Some("admin1".to_string()),
                search: None,
                parent_id: None,
                limit: None,
                offset: None,
            },
        )
        .unwrap();

        assert_eq!(result.total, 3);
        assert_eq!(result.items.len(), 3);
        assert!(result.items.iter().all(|r| r.region_level == "admin1"));
    }
}
