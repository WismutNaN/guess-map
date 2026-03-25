pub mod commands;
pub mod compiler;
pub mod db;
pub mod import;
pub mod seed;

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
        // Seed hint types and data even if regions exist (idempotent)
        seed_data(&conn);
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

    // Seed hint types and data
    seed_data(&conn);
}

fn seed_data(conn: &rusqlite::Connection) {
    match seed::hint_types::seed(conn) {
        Ok(n) if n > 0 => eprintln!("Seeded {} hint types", n),
        Err(e) => eprintln!("Failed to seed hint types: {}", e),
        _ => {}
    }
    match seed::driving_side::seed(conn) {
        Ok(n) if n > 0 => eprintln!("Seeded {} driving_side hints", n),
        Err(e) => eprintln!("Failed to seed driving_side: {}", e),
        _ => {}
    }
    match seed::flags::seed(conn) {
        Ok(n) if n > 0 => eprintln!("Seeded {} flag hints", n),
        Err(e) => eprintln!("Failed to seed flags: {}", e),
        _ => {}
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
            commands::hints::get_hint_types,
            commands::hints::get_hint_counts,
            commands::hints::get_hints_by_region,
            commands::hints::compile_hint_layer,
            commands::hints::compile_polygon_enrichment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
