/// Fetch a Google Street View coverage tile via Tauri IPC.
/// Returns raw PNG bytes through tauri::ipc::Response (binary, not JSON).
/// This bypasses all CORS, CSP, proxy, and VPN issues.

use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();

fn client() -> &'static reqwest::blocking::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(15))
            .pool_max_idle_per_host(4)
            .danger_accept_invalid_certs(true) // Corporate VPN SSL inspection
            .build()
            .expect("Failed to create HTTP client")
    })
}

#[tauri::command]
pub async fn fetch_gsv_tile(z: u32, x: u32, y: u32) -> Result<tauri::ipc::Response, String> {
    let server = x % 4;
    let url = format!(
        "https://mts{}.google.com/vt?hl=en-US&lyrs=svv&style=40,18&x={}&y={}&z={}",
        server, x, y, z
    );

    // Run blocking HTTP in a spawn_blocking context
    let bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let resp = client()
            .get(&url)
            .send()
            .map_err(|e| format!("Tile fetch failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Google returned {}", resp.status()));
        }

        resp.bytes()
            .map(|b| b.to_vec())
            .map_err(|e| format!("Read error: {}", e))
    })
    .await
    .map_err(|e| format!("Task error: {}", e))??;

    Ok(tauri::ipc::Response::new(bytes))
}
