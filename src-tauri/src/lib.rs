pub mod agent;
pub mod commands;
pub mod compiler;
pub mod db;
pub mod import;
pub mod seed;
pub mod services;
pub mod tile_server;

use db::DbState;
use std::path::Path;
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

fn init_db_and_import(db_state: &DbState, geodata_dir: &Path) {
    let conn = db_state.conn.lock().unwrap();

    // Check if regions already imported
    let count: usize = conn
        .query_row("SELECT COUNT(*) FROM region", [], |row| row.get(0))
        .unwrap_or(0);

    if count > 0 {
        // Seed hint types and data even if regions exist (idempotent)
        seed_data(&conn);
        ensure_routes_imported(&conn, geodata_dir);
        return;
    }

    log::info!("First run: importing geodata...");

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
    ensure_routes_imported(&conn, geodata_dir);
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

fn ensure_routes_imported(conn: &rusqlite::Connection, geodata_dir: &Path) {
    let existing: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region WHERE region_level = 'route'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if existing > 0 {
        return;
    }

    let routes_path = geodata_dir.join("routes.geojson");
    match std::fs::read_to_string(&routes_path) {
        Ok(json) => match import::routes::import_routes(conn, &json) {
            Ok(n) => log::info!("Imported {} routes", n),
            Err(e) => log::error!("Failed to import routes: {}", e),
        },
        Err(e) => log::error!("Failed to read routes file {:?}: {}", routes_path, e),
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
            let geodata_dir = find_geodata_dir();

            let db_state = DbState::new(&db_path).expect("Failed to initialize database");
            let db_pool = db::pool::create_pool(&db_path).expect("Failed to initialize DB pool");
            let agent_state = agent::AgentServerState::new(app.handle().clone(), db_pool);

            {
                let conn = db_state.conn.lock().unwrap();
                let geodata_dir_str = geodata_dir.to_string_lossy();
                let _ = db::settings::set(&conn, "geodata.dir", geodata_dir_str.as_ref());
            }

            init_db_and_import(&db_state, &geodata_dir);

            // Start tile proxy server (local HTTP on 127.0.0.1)
            let tile_port = tile_server::start();
            {
                let conn = db_state.conn.lock().unwrap();
                let _ = db::settings::set(&conn, "tile_proxy.port", &tile_port.to_string());
            }

            if let Err(error) = agent::bootstrap_runtime(&db_state, &agent_state) {
                log::error!("Failed to bootstrap Agent API runtime: {}", error);
            }

            app.manage(db_state);
            app.manage(agent_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::regions::get_region_stats,
            commands::regions::search_regions,
            commands::regions::resolve_region,
            commands::regions::get_region_by_id,
            commands::regions::list_regions_by_country,
            commands::settings::get_setting,
            commands::settings::get_setting_or,
            commands::settings::set_setting,
            commands::asset::upload_asset_bytes,
            commands::hints::get_hint_types,
            commands::hints::get_hint_counts,
            commands::hints::get_hints_by_region,
            commands::hints::get_hints_by_type,
            commands::hints::get_empty_region_filter,
            commands::hints::create_hint,
            commands::hints::update_hint,
            commands::hints::delete_hint,
            commands::hints::batch_create_hints,
            commands::hints::batch_delete_hints,
            commands::hints::compile_hint_layer,
            commands::hints::compile_polygon_enrichment,
            commands::hints::compile_line_layer,
            commands::revisions::list_revision_logs,
            agent::agent_get_settings,
            agent::agent_save_settings,
            agent::agent_regenerate_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
