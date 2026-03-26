use guess_map_lib::db::DbState;
use guess_map_lib::import::geodata;

#[test]
fn test_full_import_pipeline_with_real_data() {
    let db = DbState::new_in_memory().unwrap();
    let conn = db.conn.lock().unwrap();

    // Load real Natural Earth countries
    let countries_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("assets/geodata/ne_countries.geojson");

    if !countries_path.exists() {
        eprintln!(
            "Skipping: countries geodata not found at {:?}",
            countries_path
        );
        return;
    }

    let countries_json = std::fs::read_to_string(&countries_path).unwrap();
    let country_count = geodata::import_countries(&conn, &countries_json).unwrap();

    // Should have at least 170 countries (some may be filtered by missing ISO code)
    assert!(
        country_count >= 170,
        "Expected >= 170 countries, got {}",
        country_count
    );

    // Load real Natural Earth admin1
    let admin1_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("assets/geodata/ne_admin1.geojson");

    if !admin1_path.exists() {
        eprintln!("Skipping admin1: geodata not found at {:?}", admin1_path);
        return;
    }

    let admin1_json = std::fs::read_to_string(&admin1_path).unwrap();
    let admin1_count = geodata::import_admin1(&conn, &admin1_json).unwrap();

    // Should have at least 3000 admin1 regions
    assert!(
        admin1_count >= 3000,
        "Expected >= 3000 admin1 regions, got {}",
        admin1_count
    );

    // Verify total
    let total: usize = conn
        .query_row("SELECT COUNT(*) FROM region", [], |row| row.get(0))
        .unwrap();
    assert!(
        total >= 3170,
        "Expected >= 3170 total regions, got {}",
        total
    );

    // Verify specific countries exist
    let usa_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM region WHERE country_code = 'US' AND region_level = 'country'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(usa_exists, "USA should exist");

    // Verify admin1 parent linkage
    let admin1_with_parents: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region WHERE region_level = 'admin1' AND parent_id IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        admin1_with_parents > 2000,
        "Expected > 2000 admin1 with parents, got {}",
        admin1_with_parents
    );

    eprintln!(
        "Import complete: {} countries, {} admin1, {} total, {} with parents",
        country_count, admin1_count, total, admin1_with_parents
    );
}
