use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Serialize, Clone)]
pub struct HintTypeInfo {
    pub id: String,
    pub code: String,
    pub title: String,
    pub display_family: String,
    pub schema_json: Option<String>,
    pub sort_order: i32,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct RegionHintInfo {
    pub id: String,
    pub region_id: String,
    pub hint_type_code: String,
    pub short_value: Option<String>,
    pub full_value: Option<String>,
    pub data_json: Option<String>,
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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateHintInput {
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
    pub created_by: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHintInput {
    pub id: String,
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
    pub created_by: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct HintTypeMeta {
    pub(crate) id: String,
    pub(crate) schema_json: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct HintRecord {
    pub(crate) id: String,
    pub(crate) region_id: String,
    pub(crate) hint_type_id: String,
    pub(crate) hint_type_code: String,
    pub(crate) short_value: Option<String>,
    pub(crate) full_value: Option<String>,
    pub(crate) data_json: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) confidence: f64,
    pub(crate) min_zoom: f64,
    pub(crate) max_zoom: f64,
    pub(crate) is_visible: bool,
    pub(crate) image_asset_id: Option<String>,
    pub(crate) icon_asset_id: Option<String>,
    pub(crate) source_note: Option<String>,
    pub(crate) created_by: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

impl HintRecord {
    pub(crate) fn to_info(&self) -> RegionHintInfo {
        RegionHintInfo {
            id: self.id.clone(),
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
            created_by: self.created_by.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }

    pub(crate) fn as_value(&self) -> Value {
        let parsed_data = self
            .data_json
            .as_ref()
            .and_then(|v| serde_json::from_str::<Value>(v).ok());

        json!({
            "id": self.id,
            "region_id": self.region_id,
            "hint_type_id": self.hint_type_id,
            "hint_type_code": self.hint_type_code,
            "short_value": self.short_value,
            "full_value": self.full_value,
            "data_json": parsed_data,
            "color": self.color,
            "confidence": self.confidence,
            "min_zoom": self.min_zoom,
            "max_zoom": self.max_zoom,
            "is_visible": self.is_visible,
            "image_asset_id": self.image_asset_id,
            "icon_asset_id": self.icon_asset_id,
            "source_note": self.source_note,
            "created_by": self.created_by,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        })
    }
}
