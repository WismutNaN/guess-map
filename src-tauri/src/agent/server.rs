use super::{routes, AgentApiContext};
use tokio::sync::oneshot;

#[derive(Debug)]
pub struct ServerHandle {
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl ServerHandle {
    pub fn stop(mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

pub fn start(context: AgentApiContext, port: u16) -> Result<ServerHandle, String> {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let std_listener = std::net::TcpListener::bind(addr)
        .map_err(|e| format!("Failed to bind Agent API server on {}: {}", addr, e))?;
    std_listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to set non-blocking listener: {}", e))?;

    let listener = tokio::net::TcpListener::from_std(std_listener)
        .map_err(|e| format!("Failed to create async listener: {}", e))?;

    let router = routes::build_router(context);
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });

        if let Err(error) = server.await {
            log::error!("Agent API server exited with error: {}", error);
        }
    });

    log::info!("Agent API listening on http://127.0.0.1:{port}");
    Ok(ServerHandle {
        shutdown_tx: Some(shutdown_tx),
    })
}
