use crate::commands::hints::models::{CreateHintInput, RegionHintInfo, UpdateHintInput};
use crate::commands::regions::models::RegionInfo;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Serialize)]
pub struct ListResponse<T> {
    pub items: Vec<T>,
}

#[derive(Debug, Serialize)]
pub struct PagedResponse<T> {
    pub items: Vec<T>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct HintTypeDto {
    pub id: String,
    pub code: String,
    pub title: String,
    pub display_family: String,
    pub schema_json: Option<Value>,
    pub sort_order: i32,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct RegionDto {
    pub id: String,
    pub name: String,
    pub name_en: Option<String>,
    pub country_code: Option<String>,
    pub region_level: String,
    pub geometry_ref: Option<String>,
    pub anchor_lng: Option<f64>,
    pub anchor_lat: Option<f64>,
}

impl From<RegionInfo> for RegionDto {
    fn from(region: RegionInfo) -> Self {
        Self {
            id: region.id,
            name: region.name,
            name_en: region.name_en,
            country_code: region.country_code,
            region_level: region.region_level,
            geometry_ref: region.geometry_ref,
            anchor_lng: region.anchor_lng,
            anchor_lat: region.anchor_lat,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct HintDto {
    pub id: String,
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<Value>,
    pub color: Option<String>,
    pub confidence: f64,
    pub min_zoom: f64,
    pub max_zoom: f64,
    pub is_visible: bool,
    pub image_asset_id: Option<String>,
    pub icon_asset_id: Option<String>,
    pub source_note: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<RegionHintInfo> for HintDto {
    fn from(hint: RegionHintInfo) -> Self {
        Self {
            id: hint.id,
            region_id: hint.region_id,
            hint_type_code: hint.hint_type_code,
            short_value: hint.short_value,
            full_value: hint.full_value,
            data_json: hint
                .data_json
                .and_then(|raw| serde_json::from_str::<Value>(&raw).ok()),
            color: hint.color,
            confidence: hint.confidence,
            min_zoom: hint.min_zoom,
            max_zoom: hint.max_zoom,
            is_visible: hint.is_visible,
            image_asset_id: hint.image_asset_id,
            icon_asset_id: hint.icon_asset_id,
            source_note: hint.source_note,
            created_by: hint.created_by,
            created_at: hint.created_at,
            updated_at: hint.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct RegionWithHintsDto {
    pub region: RegionDto,
    pub hints: Vec<HintDto>,
}

#[derive(Debug, Deserialize)]
pub struct RegionsQuery {
    pub country_code: Option<String>,
    pub region_level: Option<String>,
    pub search: Option<String>,
    pub parent_id: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateHintPayload {
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<Value>,
    pub color: Option<String>,
    pub confidence: Option<f64>,
    pub min_zoom: Option<f64>,
    pub max_zoom: Option<f64>,
    pub is_visible: Option<bool>,
    pub image_asset_id: Option<String>,
    pub icon_asset_id: Option<String>,
    pub source_note: Option<String>,
}

impl CreateHintPayload {
    pub fn to_create_input(&self) -> CreateHintInput {
        CreateHintInput {
            region_id: self.region_id.clone(),
            hint_type_code: self.hint_type_code.clone(),
            short_value: self.short_value.clone(),
            full_value: self.full_value.clone(),
            data_json: self.data_json.clone(),
            color: self.color.clone(),
            confidence: self.confidence,
            min_zoom: self.min_zoom,
            max_zoom: self.max_zoom,
            is_visible: self.is_visible,
            image_asset_id: self.image_asset_id.clone(),
            icon_asset_id: self.icon_asset_id.clone(),
            source_note: self.source_note.clone(),
            created_by: Some("agent".to_string()),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateHintPayload {
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<Value>,
    pub color: Option<String>,
    pub confidence: Option<f64>,
    pub min_zoom: Option<f64>,
    pub max_zoom: Option<f64>,
    pub is_visible: Option<bool>,
    pub image_asset_id: Option<String>,
    pub icon_asset_id: Option<String>,
    pub source_note: Option<String>,
}

impl UpdateHintPayload {
    pub fn to_update_input(&self, id: String) -> UpdateHintInput {
        UpdateHintInput {
            id,
            region_id: self.region_id.clone(),
            hint_type_code: self.hint_type_code.clone(),
            short_value: self.short_value.clone(),
            full_value: self.full_value.clone(),
            data_json: self.data_json.clone(),
            color: self.color.clone(),
            confidence: self.confidence,
            min_zoom: self.min_zoom,
            max_zoom: self.max_zoom,
            is_visible: self.is_visible,
            image_asset_id: self.image_asset_id.clone(),
            icon_asset_id: self.icon_asset_id.clone(),
            source_note: self.source_note.clone(),
            created_by: Some("agent".to_string()),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct BatchHintsPayload {
    pub hints: Vec<CreateHintPayload>,
}

#[derive(Debug, Deserialize)]
pub struct ByCountryPayload {
    pub country_code: String,
    pub region_level: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<Value>,
    pub color: Option<String>,
    pub confidence: Option<f64>,
    pub min_zoom: Option<f64>,
    pub max_zoom: Option<f64>,
    pub is_visible: Option<bool>,
    pub image_asset_id: Option<String>,
    pub icon_asset_id: Option<String>,
    pub source_note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BatchHintsResponse {
    pub created: usize,
    pub ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CompileLayersPayload {
    pub hint_type_codes: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct CompileLayersResponse {
    pub compiled: Vec<String>,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub regions_total: usize,
    pub regions_with_hints: usize,
    pub hints_total: usize,
    pub hints_by_type: HashMap<String, usize>,
    pub hints_by_author: HashMap<String, usize>,
}
