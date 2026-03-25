pub mod commands;
pub mod db;
pub mod import;

use db::DbState;
use std::path::PathBuf;
use tauri::Manager;

fn get_db_path(app: &tauri::App) -> PathBuf {
    let app_data = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_data).expect("Failed to create app data dir");
    app_data.join("guessmap.db")
}

fn find_geodata_dir() -> PathBuf {
    // In dev: assets/geodata relative to src-tauri parent
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("assets")
        .join("geodata");
    if dev_path.exists() {
        return dev_path;
    }
    // Fallback: current dir
    PathBuf::from("assets/geodata")
}

fn init_db_and_import(db_state: &DbState) {
    let conn = db_state.conn.lock().unwrap();

    // Check if regions already imported
    let count: usize = conn
        .query_row("SELECT COUNT(*) FROM region", [], |row| row.get(0))
        .unwrap_or(0);

    if count > 0 {
        log::info!("Database already has {} regions, skipping import", count);
        return;
    }

    log::info!("First run: importing geodata...");

    let geodata_dir = find_geodata_dir();

    // Import countries
    let countries_path = geodata_dir.join("ne_countries.geojson");
    match std::fs::read_to_string(&countries_path) {
        Ok(json) => match import::geodata::import_countries(&conn, &json) {
            Ok(n) => log::info!("Imported {} countries", n),
            Err(e) => log::error!("Failed to import countries: {}", e),
        },
        Err(e) => log::error!("Failed to read countries file {:?}: {}", countries_path, e),
    }

    // Import admin1
    let admin1_path = geodata_dir.join("ne_admin1.geojson");
    match std::fs::read_to_string(&admin1_path) {
        Ok(json) => match import::geodata::import_admin1(&conn, &json) {
            Ok(n) => log::info!("Imported {} admin1 regions", n),
            Err(e) => log::error!("Failed to import admin1: {}", e),
        },
        Err(e) => log::error!("Failed to read admin1 file {:?}: {}", admin1_path, e),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .setup(|app| {
            let db_path = get_db_path(app);
            eprintln!("Database path: {:?}", db_path);

            let db_state =
                DbState::new(&db_path).expect("Failed to initialize database");

            init_db_and_import(&db_state);

            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::regions::get_region_stats,
            commands::regions::search_regions,
            commands::settings::get_setting,
            commands::settings::get_setting_or,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
