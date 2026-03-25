use crate::db::DbState;
use crate::services::revision;
use image::GenericImageView;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{Manager, State};
use uuid::Uuid;

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

#[tauri::command]
pub fn upload_asset_bytes(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    input: UploadAssetInput,
) -> Result<AssetInfo, String> {
    if input.bytes.is_empty() {
        return Err("File is empty".to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let assets_dir = app_data_dir.join("assets");
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    save_asset_impl(&mut conn, &assets_dir, input)
}

fn save_asset_impl(
    conn: &mut Connection,
    assets_dir: &Path,
    input: UploadAssetInput,
) -> Result<AssetInfo, String> {
    std::fs::create_dir_all(assets_dir).map_err(|e| e.to_string())?;

    let kind = normalize_kind(input.kind)?;
    let caption = normalize_optional_text(input.caption);
    let created_by = normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());
    let ext = safe_extension(&input.file_name);

    let asset_id = Uuid::new_v4().to_string();
    let stored_name = format!("{}.{}", asset_id, ext);
    let full_path = assets_dir.join(&stored_name);
    std::fs::write(&full_path, &input.bytes).map_err(|e| e.to_string())?;

    let (mime_type, width, height) = detect_image_metadata(&input.bytes, &ext);
    let relative_path = format!("assets/{}", stored_name);

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO asset (id, file_path, kind, mime_type, width, height, caption)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            asset_id,
            relative_path,
            kind,
            mime_type,
            width,
            height,
            caption,
        ],
    )
    .map_err(|e| e.to_string())?;

    revision::log(
        &tx,
        "asset",
        &asset_id,
        "create",
        None,
        &created_by,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(AssetInfo {
        id: asset_id,
        file_path: relative_path,
        kind,
        mime_type,
        width,
        height,
        caption,
    })
}

fn detect_image_metadata(bytes: &[u8], extension: &str) -> (Option<String>, Option<i32>, Option<i32>) {
    let mut mime_type = infer_mime_from_extension(extension);
    let mut width = None;
    let mut height = None;

    if let Ok(format) = image::guess_format(bytes) {
        if let Ok(decoded) = image::load_from_memory_with_format(bytes, format) {
            let (w, h) = decoded.dimensions();
            width = Some(w as i32);
            height = Some(h as i32);
        }
        if mime_type.is_none() {
            mime_type = Some(match format {
                image::ImageFormat::Png => "image/png".to_string(),
                image::ImageFormat::Jpeg => "image/jpeg".to_string(),
                image::ImageFormat::WebP => "image/webp".to_string(),
                image::ImageFormat::Gif => "image/gif".to_string(),
                image::ImageFormat::Bmp => "image/bmp".to_string(),
                image::ImageFormat::Tiff => "image/tiff".to_string(),
                _ => "application/octet-stream".to_string(),
            });
        }
    }

    (mime_type, width, height)
}

fn normalize_kind(kind: Option<String>) -> Result<String, String> {
    let value = normalize_optional_text(kind).unwrap_or_else(|| "sample".to_string());
    let allowed = ["flag", "sample", "icon", "thumbnail", "photo"];
    if allowed.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(format!("Invalid asset kind '{}'", value))
    }
}

fn safe_extension(file_name: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase())
        .filter(|v| !v.is_empty() && v.len() <= 10 && v.chars().all(|c| c.is_ascii_alphanumeric()));

    ext.unwrap_or_else(|| "bin".to_string())
}

fn infer_mime_from_extension(extension: &str) -> Option<String> {
    let mime = match extension {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    Some(mime.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;
    use std::io::Cursor;
    use std::path::PathBuf;

    fn make_test_png() -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(2, 1, image::Rgba([255, 0, 0, 255]));
        let mut bytes = Vec::new();
        let mut cursor = Cursor::new(&mut bytes);
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn temp_assets_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("guess-map-asset-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_save_asset_creates_file_and_record() {
        let db = DbState::new_in_memory().unwrap();
        let mut conn = db.conn.into_inner().unwrap();
        let assets_dir = temp_assets_dir();
        let png = make_test_png();

        let asset = save_asset_impl(
            &mut conn,
            &assets_dir,
            UploadAssetInput {
                file_name: "sample.png".to_string(),
                bytes: png,
                kind: Some("sample".to_string()),
                caption: Some("test".to_string()),
                created_by: Some("user".to_string()),
            },
        )
        .unwrap();

        assert_eq!(asset.width, Some(2));
        assert_eq!(asset.height, Some(1));
        assert_eq!(asset.mime_type.as_deref(), Some("image/png"));

        let file_name = asset
            .file_path
            .strip_prefix("assets/")
            .expect("relative path must start with assets/");
        let full_path = assets_dir.join(file_name);
        assert!(full_path.exists(), "asset file not created: {:?}", full_path);

        let db_count: usize = conn
            .query_row("SELECT COUNT(*) FROM asset", [], |row| row.get(0))
            .unwrap();
        assert_eq!(db_count, 1);

        let rev_count: usize = conn
            .query_row("SELECT COUNT(*) FROM revision_log WHERE entity_type='asset'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rev_count, 1);

        let _ = std::fs::remove_dir_all(assets_dir);
    }
}
