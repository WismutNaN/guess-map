use super::models::{AssetInfo, CropAssetInput, ReplaceAssetInput, UploadAssetInput};
use crate::services::revision;
use image::GenericImageView;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use serde_json::json;
use std::io::Cursor;
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

pub(crate) fn replace_asset(
    conn: &mut Connection,
    app_data_dir: &Path,
    input: ReplaceAssetInput,
) -> Result<AssetInfo, String> {
    if input.bytes.is_empty() {
        return Err("File is empty".to_string());
    }

    let existing = load_asset_row(conn, &input.asset_id)?;
    let ext = safe_extension(&input.file_name);
    let stored_name = format!("{}.{}", input.asset_id, ext);
    let relative_path = format!("assets/{}", stored_name);
    let full_path = app_data_dir.join(&relative_path);
    let parent = full_path
        .parent()
        .ok_or_else(|| "Invalid asset target path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    std::fs::write(&full_path, &input.bytes).map_err(|e| e.to_string())?;

    let (mime_type, width, height) = detect_image_metadata(&input.bytes, &ext);
    let caption = normalize_optional_text(input.caption).or(existing.caption.clone());
    let updated_by =
        normalize_optional_text(input.updated_by).unwrap_or_else(|| "user".to_string());

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE asset
         SET file_path = ?2, mime_type = ?3, width = ?4, height = ?5, caption = ?6
         WHERE id = ?1",
        rusqlite::params![
            input.asset_id,
            relative_path,
            mime_type,
            width,
            height,
            caption
        ],
    )
    .map_err(|e| e.to_string())?;
    let replace_diff = json!({
        "op": "replace",
        "file_path_before": existing.file_path,
        "file_path_after": relative_path,
        "width": width,
        "height": height,
    });
    revision::log(
        &tx,
        "asset",
        &input.asset_id,
        "update",
        Some(&replace_diff),
        &updated_by,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    if existing.file_path != relative_path {
        let old_full_path = app_data_dir.join(existing.file_path);
        let _ = std::fs::remove_file(old_full_path);
    }

    Ok(AssetInfo {
        id: input.asset_id,
        file_path: relative_path,
        kind: existing.kind,
        mime_type,
        width,
        height,
        caption,
    })
}

pub(crate) fn crop_asset(
    conn: &mut Connection,
    app_data_dir: &Path,
    input: CropAssetInput,
) -> Result<AssetInfo, String> {
    let existing = load_asset_row(conn, &input.asset_id)?;
    let source_path = app_data_dir.join(&existing.file_path);
    let source_bytes =
        std::fs::read(&source_path).map_err(|e| format!("Failed to read source image: {}", e))?;

    let format =
        image::guess_format(&source_bytes).map_err(|_| "Asset is not a supported raster image".to_string())?;
    let source = image::load_from_memory_with_format(&source_bytes, format)
        .map_err(|_| "Asset is not a supported raster image".to_string())?;
    let (source_width, source_height) = source.dimensions();

    let x = input.x.min(source_width.saturating_sub(1));
    let y = input.y.min(source_height.saturating_sub(1));
    let max_w = source_width.saturating_sub(x);
    let max_h = source_height.saturating_sub(y);
    let crop_w = input.width.min(max_w);
    let crop_h = input.height.min(max_h);
    if crop_w == 0 || crop_h == 0 {
        return Err("Crop rectangle is outside image bounds".to_string());
    }

    let cropped = image::imageops::crop_imm(&source, x, y, crop_w, crop_h).to_image();
    let out_image = image::DynamicImage::ImageRgba8(cropped);
    let mut bytes = Vec::new();
    let mut cursor = Cursor::new(&mut bytes);
    out_image
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode cropped image: {}", e))?;

    let relative_path = format!("assets/{}.png", input.asset_id);
    let full_path = app_data_dir.join(&relative_path);
    let parent = full_path
        .parent()
        .ok_or_else(|| "Invalid asset target path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    std::fs::write(&full_path, &bytes).map_err(|e| e.to_string())?;

    let caption = normalize_optional_text(input.caption).or(existing.caption.clone());
    let updated_by =
        normalize_optional_text(input.updated_by).unwrap_or_else(|| "user".to_string());

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE asset
         SET file_path = ?2, mime_type = 'image/png', width = ?3, height = ?4, caption = ?5
         WHERE id = ?1",
        rusqlite::params![
            input.asset_id,
            relative_path,
            crop_w as i32,
            crop_h as i32,
            caption
        ],
    )
    .map_err(|e| e.to_string())?;
    let crop_diff = json!({
        "op": "crop",
        "x": x,
        "y": y,
        "width": crop_w,
        "height": crop_h,
    });
    revision::log(
        &tx,
        "asset",
        &input.asset_id,
        "update",
        Some(&crop_diff),
        &updated_by,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    if existing.file_path != relative_path {
        let old_full_path = app_data_dir.join(existing.file_path);
        let _ = std::fs::remove_file(old_full_path);
    }

    Ok(AssetInfo {
        id: input.asset_id,
        file_path: relative_path,
        kind: existing.kind,
        mime_type: Some("image/png".to_string()),
        width: Some(crop_w as i32),
        height: Some(crop_h as i32),
        caption,
    })
}

struct ExistingAssetRow {
    file_path: String,
    kind: String,
    caption: Option<String>,
}

fn load_asset_row(conn: &Connection, asset_id: &str) -> Result<ExistingAssetRow, String> {
    conn.query_row(
        "SELECT file_path, kind, caption FROM asset WHERE id = ?1",
        [asset_id],
        |row| {
            Ok(ExistingAssetRow {
                file_path: row.get(0)?,
                kind: row.get(1)?,
                caption: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Asset '{}' not found", asset_id))
}
