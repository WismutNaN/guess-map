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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadAssetInput {
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub kind: Option<String>,
    pub caption: Option<String>,
    pub created_by: Option<String>,
}
