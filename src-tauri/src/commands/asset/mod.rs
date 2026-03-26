mod models;
pub(crate) mod service;

use crate::db::DbState;
use base64::Engine;
pub use models::{
    AssetEditorItem, AssetInfo, AssetUsageInfo, CropAssetInput, DeleteAssetInput,
    ReplaceAssetInput, UploadAssetInput,
};
use rusqlite::OptionalExtension;
use tauri::{Manager, State};

#[tauri::command]
pub fn upload_asset_bytes(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    input: UploadAssetInput,
) -> Result<AssetInfo, String> {
    if input.bytes.is_empty() {
        return Err("File is empty".to_string());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let assets_dir = app_data_dir.join("assets");
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    service::save_asset(&mut conn, &assets_dir, input)
}

#[tauri::command]
pub fn get_asset_data_url(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    asset_id: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let row: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT file_path, mime_type FROM asset WHERE id = ?1",
            [&asset_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (file_path, mime_type) = row.ok_or_else(|| format!("Asset '{}' not found", asset_id))?;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let normalized_path = file_path.replace('\\', "/");
    let full_path = app_data_dir.join(&normalized_path);
    let bytes = std::fs::read(&full_path)
        .map_err(|e| format!("Failed to read asset file '{}': {}", full_path.display(), e))?;

    let mime = mime_type
        .or_else(|| infer_mime_from_file_path(&normalized_path))
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
pub fn list_assets_for_editor(db: State<'_, DbState>) -> Result<Vec<AssetEditorItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "WITH usage_base AS (
                SELECT image_asset_id AS asset_id, hint_type_id, region_id
                FROM region_hint
                WHERE image_asset_id IS NOT NULL
                UNION ALL
                SELECT icon_asset_id AS asset_id, hint_type_id, region_id
                FROM region_hint
                WHERE icon_asset_id IS NOT NULL
            ),
            usage_stats AS (
                SELECT
                    ub.asset_id AS asset_id,
                    COUNT(*) AS usage_count,
                    GROUP_CONCAT(DISTINCT ht.code) AS hint_types,
                    GROUP_CONCAT(DISTINCT COALESCE(r.country_code, '')) AS country_codes
                FROM usage_base ub
                JOIN hint_type ht ON ht.id = ub.hint_type_id
                JOIN region r ON r.id = ub.region_id
                GROUP BY ub.asset_id
            )
            SELECT
                a.id,
                a.file_path,
                a.kind,
                a.mime_type,
                a.width,
                a.height,
                a.caption,
                a.created_at,
                COALESCE(us.usage_count, 0),
                COALESCE(us.hint_types, ''),
                COALESCE(us.country_codes, '')
            FROM asset a
            LEFT JOIN usage_stats us ON us.asset_id = a.id
            ORDER BY a.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let usage_count: i64 = row.get(8)?;
            let hint_types: String = row.get(9)?;
            let country_codes: String = row.get(10)?;
            Ok(AssetEditorItem {
                id: row.get(0)?,
                file_path: row.get(1)?,
                kind: row.get(2)?,
                mime_type: row.get(3)?,
                width: row.get(4)?,
                height: row.get(5)?,
                caption: row.get(6)?,
                created_at: row.get(7)?,
                usage_count: usage_count.clamp(0, i64::from(i32::MAX)) as i32,
                hint_type_codes: split_csv(hint_types),
                country_codes: split_csv(country_codes),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }

    Ok(out)
}

#[tauri::command]
pub fn list_asset_usage(
    db: State<'_, DbState>,
    asset_id: String,
) -> Result<Vec<AssetUsageInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT
                rh.id,
                CASE
                    WHEN rh.image_asset_id = ?1 AND rh.icon_asset_id = ?1 THEN 'image+icon'
                    WHEN rh.image_asset_id = ?1 THEN 'image'
                    ELSE 'icon'
                END AS link_field,
                ht.code,
                ht.title,
                r.id,
                r.name,
                r.region_level,
                r.country_code,
                rh.short_value,
                rh.full_value,
                rh.source_note,
                rh.confidence,
                rh.created_by,
                rh.created_at,
                rh.updated_at
             FROM region_hint rh
             JOIN hint_type ht ON ht.id = rh.hint_type_id
             JOIN region r ON r.id = rh.region_id
             WHERE rh.image_asset_id = ?1 OR rh.icon_asset_id = ?1
             ORDER BY ht.sort_order ASC, ht.title ASC, r.name ASC, rh.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&asset_id], |row| {
            Ok(AssetUsageInfo {
                hint_id: row.get(0)?,
                link_field: row.get(1)?,
                hint_type_code: row.get(2)?,
                hint_type_title: row.get(3)?,
                region_id: row.get(4)?,
                region_name: row.get(5)?,
                region_level: row.get(6)?,
                country_code: row.get(7)?,
                short_value: row.get(8)?,
                full_value: row.get(9)?,
                source_note: row.get(10)?,
                confidence: row.get(11)?,
                created_by: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn replace_asset_bytes(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    input: ReplaceAssetInput,
) -> Result<AssetInfo, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    service::replace_asset(&mut conn, &app_data_dir, input)
}

#[tauri::command]
pub fn crop_asset_image(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    input: CropAssetInput,
) -> Result<AssetInfo, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    service::crop_asset(&mut conn, &app_data_dir, input)
}

#[tauri::command]
pub fn delete_asset(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    input: DeleteAssetInput,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    service::delete_asset(&mut conn, &app_data_dir, input)
}

fn infer_mime_from_file_path(file_path: &str) -> Option<String> {
    let ext = std::path::Path::new(file_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())?;

    let mime = match ext.as_str() {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => return None,
    };

    Some(mime.to_string())
}

fn split_csv(value: String) -> Vec<String> {
    value
        .split(',')
        .filter_map(|raw| {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;
    use std::io::Cursor;
    use std::path::PathBuf;
    use uuid::Uuid;

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

    fn temp_app_data_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("guess-map-app-data-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_save_asset_creates_file_and_record() {
        let db = DbState::new_in_memory().unwrap();
        let mut conn = db.conn.into_inner().unwrap();
        let assets_dir = temp_assets_dir();
        let png = make_test_png();

        let asset = service::save_asset(
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
        assert!(
            full_path.exists(),
            "asset file not created: {:?}",
            full_path
        );

        let db_count: usize = conn
            .query_row("SELECT COUNT(*) FROM asset", [], |row| row.get(0))
            .unwrap();
        assert_eq!(db_count, 1);

        let rev_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM revision_log WHERE entity_type='asset'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rev_count, 1);

        let _ = std::fs::remove_dir_all(assets_dir);
    }

    #[test]
    fn test_delete_asset_removes_record_and_file() {
        let db = DbState::new_in_memory().unwrap();
        let mut conn = db.conn.into_inner().unwrap();
        let app_data_dir = temp_app_data_dir();
        let assets_dir = app_data_dir.join("assets");
        std::fs::create_dir_all(&assets_dir).unwrap();
        let png = make_test_png();

        let asset = service::save_asset(
            &mut conn,
            &assets_dir,
            UploadAssetInput {
                file_name: "sample.png".to_string(),
                bytes: png,
                kind: Some("sample".to_string()),
                caption: Some("to delete".to_string()),
                created_by: Some("user".to_string()),
            },
        )
        .unwrap();

        let file_name = asset
            .file_path
            .strip_prefix("assets/")
            .expect("relative path must start with assets/");
        let full_path = assets_dir.join(file_name);
        assert!(full_path.exists(), "asset file should exist before delete");

        service::delete_asset(
            &mut conn,
            &app_data_dir,
            DeleteAssetInput {
                asset_id: asset.id.clone(),
                deleted_by: Some("user".to_string()),
            },
        )
        .unwrap();

        let exists: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM asset WHERE id = ?1",
                [&asset.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 0, "asset row should be deleted");
        assert!(!full_path.exists(), "asset file should be removed");

        let delete_revisions: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM revision_log
                 WHERE entity_type='asset' AND entity_id = ?1 AND action='delete'",
                [&asset.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(delete_revisions, 1, "delete revision should be logged");

        let _ = std::fs::remove_dir_all(app_data_dir);
    }
}
