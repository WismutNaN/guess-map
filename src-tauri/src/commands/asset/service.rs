use super::models::{AssetInfo, UploadAssetInput};
use crate::services::revision;
use image::GenericImageView;
use rusqlite::Connection;
use std::path::Path;
use uuid::Uuid;

pub(crate) fn save_asset(
    conn: &mut Connection,
    assets_dir: &Path,
    input: UploadAssetInput,
) -> Result<AssetInfo, String> {
    std::fs::create_dir_all(assets_dir).map_err(|e| e.to_string())?;

    let kind = normalize_kind(input.kind)?;
    let caption = normalize_optional_text(input.caption);
    let created_by =
        normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());
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

    revision::log(&tx, "asset", &asset_id, "create", None, &created_by, None)?;
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

fn detect_image_metadata(
    bytes: &[u8],
    extension: &str,
) -> (Option<String>, Option<i32>, Option<i32>) {
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
