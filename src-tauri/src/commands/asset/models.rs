use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
pub struct AssetInfo {
    pub id: String,
    pub file_path: String,
    pub kind: String,
    pub mime_type: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub caption: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AssetEditorItem {
    pub id: String,
    pub file_path: String,
    pub kind: String,
    pub mime_type: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub caption: Option<String>,
    pub created_at: String,
    pub usage_count: i32,
    pub hint_type_codes: Vec<String>,
    pub country_codes: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadAssetInput {
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub kind: Option<String>,
    pub caption: Option<String>,
    pub created_by: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceAssetInput {
    pub asset_id: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub caption: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CropAssetInput {
    pub asset_id: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub caption: Option<String>,
    pub updated_by: Option<String>,
}
