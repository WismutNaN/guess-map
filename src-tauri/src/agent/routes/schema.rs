use axum::Json;
use serde_json::{json, Value};

pub async fn get_schema() -> Json<Value> {
    Json(json!({
      "openapi": "3.0.0",
      "info": {
        "title": "GuessMap Agent API",
        "version": "1.0.0"
      },
      "paths": {
        "/api/hint-types": { "get": {} },
        "/api/regions": { "get": {} },
        "/api/regions/{id}": { "get": {} },
        "/api/regions/{id}/hints": { "get": {} },
        "/api/hints": { "post": {} },
        "/api/hints/batch": { "post": {} },
        "/api/hints/by-country": { "post": {} },
        "/api/hints/{id}": { "put": {}, "delete": {} },
        "/api/layers/compile": { "post": {} },
        "/api/stats": { "get": {} },
        "/api/schema": { "get": {} }
      }
    }))
}

pub async fn get_health() -> Json<Value> {
    Json(json!({
        "ok": true
    }))
}
