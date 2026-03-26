mod models;
pub(crate) mod service;

use crate::db::DbState;
pub use models::{AssetInfo, UploadAssetInput};
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
}
