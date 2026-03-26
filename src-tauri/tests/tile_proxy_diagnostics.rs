use guess_map_lib::tile_server;

#[test]
fn test_tile_proxy_returns_400_for_invalid_path_with_diagnostic_body() {
    let port = tile_server::start();
    let url = format!("http://127.0.0.1:{}/invalid", port);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("Failed to build test HTTP client");

    let response = client
        .get(&url)
        .send()
        .unwrap_or_else(|e| panic!("Proxy request failed at {}: {}", url, e));

    let status = response.status();
    let cors = response
        .headers()
        .get("access-control-allow-origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response.text().unwrap_or_default();

    assert_eq!(
        status,
        reqwest::StatusCode::BAD_REQUEST,
        "Unexpected status for invalid path. body={}",
        body
    );
    assert_eq!(
        cors, "*",
        "CORS header missing/mismatched for proxy response"
    );
    assert!(
        body.contains("Expected /svv/{z}/{x}/{y}"),
        "Unexpected diagnostic body: {}",
        body
    );
}

#[test]
#[ignore = "Network-dependent diagnostic. Run manually: cargo test --test tile_proxy_diagnostics -- --ignored --nocapture"]
fn test_tile_proxy_can_fetch_real_google_tile() {
    let port = tile_server::start();
    // London (dense coverage area), z=14 tile
    let url = format!("http://127.0.0.1:{}/svv/14/8186/5448", port);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("Failed to build test HTTP client");

    let response = client
        .get(&url)
        .send()
        .unwrap_or_else(|e| panic!("Tile request failed at {}: {}", url, e));

    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .bytes()
        .unwrap_or_else(|e| panic!("Failed to read tile body: {}", e));

    assert!(
        status.is_success(),
        "Tile proxy returned non-success status={} content_type={} body_len={}",
        status,
        content_type,
        body.len()
    );
    assert!(
        !body.is_empty(),
        "Tile proxy returned empty body with status={} content_type={}",
        status,
        content_type
    );
    assert!(
        content_type.starts_with("image/"),
        "Expected image content-type, got {} (status={})",
        content_type,
        status
    );

    // Guard against legacy transparent placeholder tiles (1x1 PNG, ~68 bytes).
    let image = image::load_from_memory(&body)
        .unwrap_or_else(|e| panic!("Failed to decode tile image: {}", e))
        .to_rgba8();
    let (w, h) = image.dimensions();
    assert!(
        w >= 64 && h >= 64,
        "Unexpected tiny tile dimensions {}x{} (status={} content_type={} body_len={})",
        w,
        h,
        status,
        content_type,
        body.len()
    );

    let non_transparent = image.pixels().filter(|p| p.0[3] > 0).count();
    assert!(
        non_transparent > 0,
        "Tile is fully transparent ({}x{}, status={}, content_type={}, body_len={})",
        w,
        h,
        status,
        content_type,
        body.len()
    );
}
