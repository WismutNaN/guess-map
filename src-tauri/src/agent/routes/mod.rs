mod assets;
mod error;
mod helpers;
mod hint_types;
mod hints;
mod layers;
mod models;
mod regions;
mod schema;
mod stats;

use super::{middleware, AgentApiContext};
use axum::routing::{get, post, put};
use axum::{middleware as axum_middleware, Router};

pub fn build_router(state: AgentApiContext) -> Router {
    Router::new()
        .route("/api/hint-types", get(hint_types::get_hint_types))
        .route("/api/regions", get(regions::get_regions))
        .route("/api/regions/{id}", get(regions::get_region))
        .route("/api/regions/{id}/hints", get(regions::get_region_hints))
        .route("/api/hints", post(hints::create_hint))
        .route("/api/hints/batch", post(hints::create_hints_batch))
        .route(
            "/api/hints/by-country",
            post(hints::create_hints_by_country),
        )
        .route(
            "/api/hints/{id}",
            put(hints::update_hint).delete(hints::delete_hint),
        )
        .route("/api/assets", post(assets::upload_asset))
        .route("/api/assets/{id}", get(assets::get_asset))
        .route("/api/layers/compile", post(layers::compile_layers))
        .route("/api/stats", get(stats::get_stats))
        .route("/api/schema", get(schema::get_schema))
        .route("/api/health", get(schema::get_health))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::require_bearer,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::rate_limit,
        ))
        .with_state(state)
}
