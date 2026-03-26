//! Minimal local HTTP server that proxies Google Street View coverage tiles.
//! Runs on a random port on 127.0.0.1, returns tiles with CORS headers.
//! Uses a persistent reqwest::blocking::Client for connection pooling.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;

/// Start the tile proxy server on a random port. Returns the port number.
/// The server runs in a background thread and lives for the app's lifetime.
pub fn start() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind tile proxy");
    let port = listener.local_addr().unwrap().port();

    let client = Arc::new(
        reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .pool_max_idle_per_host(4)
            .danger_accept_invalid_certs(true) // Corporate VPN SSL inspection
            .build()
            .expect("Failed to create HTTP client"),
    );

    // Warm up: pre-establish TLS connections to all 4 Google tile servers
    let warmup_client = Arc::clone(&client);
    std::thread::spawn(move || {
        for i in 0..4u32 {
            let url = format!(
                "https://mts{}.google.com/vt?hl=en-US&lyrs=svv&style=40,18&x=0&y=0&z=0",
                i
            );
            match warmup_client.get(&url).send() {
                Ok(resp) => eprintln!(
                    "Tile proxy warmup mts{}: {} ({} bytes)",
                    i,
                    resp.status(),
                    resp.content_length().unwrap_or(0)
                ),
                Err(e) => eprintln!("Tile proxy warmup mts{} failed: {}", i, e),
            }
        }
    });

    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let client = Arc::clone(&client);
            std::thread::spawn(move || {
                if let Err(e) = handle_connection(stream, &client) {
                    let msg = e.to_string();
                    // Don't spam logs with client-disconnect errors
                    if !msg.contains("10053") && !msg.contains("10054") {
                        eprintln!("Tile proxy error: {}", msg);
                    }
                }
            });
        }
    });

    eprintln!("Tile proxy listening on 127.0.0.1:{}", port);
    port
}

fn handle_connection(
    mut stream: TcpStream,
    client: &reqwest::blocking::Client,
) -> Result<(), Box<dyn std::error::Error>> {
    // Set TCP timeouts
    stream.set_read_timeout(Some(std::time::Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(30)))?;

    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    // Parse "GET /svv/{z}/{x}/{y} HTTP/1.1"
    let path = request_line.split_whitespace().nth(1).unwrap_or("/");

    // Drain remaining headers
    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        if line.trim().is_empty() {
            break;
        }
    }

    // Handle CORS preflight
    if request_line.starts_with("OPTIONS") {
        let resp = "HTTP/1.1 204 No Content\r\n\
            Access-Control-Allow-Origin: *\r\n\
            Access-Control-Allow-Methods: GET\r\n\
            Access-Control-Max-Age: 86400\r\n\
            Content-Length: 0\r\n\
            Connection: close\r\n\
            \r\n";
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    // Parse /svv/{z}/{x}/{y}
    let stripped = path.trim_start_matches("/svv/");
    let parts: Vec<&str> = stripped.split('/').collect();
    if parts.len() != 3 {
        write_response(&mut stream, 400, "text/plain", b"Expected /svv/{z}/{x}/{y}")?;
        return Ok(());
    }

    let z = parts[0];
    let x = parts[1];
    let y = parts[2];
    let server = x.parse::<u32>().unwrap_or(0) % 4;

    let url = format!(
        "https://mts{}.google.com/vt?hl=en-US&lyrs=svv&style=40,18&x={}&y={}&z={}",
        server, x, y, z
    );

    match client.get(&url).send() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let content_type = resp
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("image/png")
                .to_string();
            let bytes = resp.bytes().unwrap_or_default();
            write_response(&mut stream, status, &content_type, &bytes)?;
        }
        Err(e) => {
            eprintln!("Google tile fetch failed for {}: {}", url, e);
            let body = format!("Proxy error: {}", e);
            write_response(&mut stream, 502, "text/plain", body.as_bytes())?;
        }
    }

    Ok(())
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        502 => "Bad Gateway",
        _ => "OK",
    };
    let header = format!(
        "HTTP/1.1 {} {}\r\n\
        Access-Control-Allow-Origin: *\r\n\
        Content-Type: {}\r\n\
        Content-Length: {}\r\n\
        Cache-Control: public, max-age=86400\r\n\
        Connection: close\r\n\
        \r\n",
        status, reason, content_type, body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()?;
    Ok(())
}
