pub mod auth;
pub mod middleware;
pub mod routes;
pub mod server;

use crate::db::{pool::DbPool, settings, DbState};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

const DEFAULT_AGENT_API_PORT: u16 = 21345;
const KEY_ENABLED: &str = "agent_api.enabled";
const KEY_PORT: &str = "agent_api.port";
const KEY_AUTO_APPROVE: &str = "agent_api.auto_approve";
const KEY_TOKEN_HASH: &str = "agent_api.token_hash";
const KEY_TOKEN_PREVIEW: &str = "agent_api.token_preview";

#[derive(Clone)]
pub struct AgentApiContext {
    pub pool: DbPool,
    pub app_handle: Option<AppHandle>,
    pub token_hash: String,
    pub rate_limiter: Arc<middleware::RateLimiter>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApiSettings {
    pub enabled: bool,
    pub port: u16,
    pub auto_approve: bool,
    pub has_token: bool,
    pub token_preview: Option<String>,
    pub running: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentApiSettingsInput {
    pub enabled: bool,
    pub port: u16,
    pub auto_approve: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentApiSettingsResponse {
    pub settings: AgentApiSettings,
    pub generated_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateTokenResponse {
    pub token: String,
    pub settings: AgentApiSettings,
}

#[derive(Debug)]
struct RuntimeState {
    handle: Option<server::ServerHandle>,
    port: Option<u16>,
    token_hash: Option<String>,
}

pub struct AgentServerState {
    app_handle: AppHandle,
    pool: DbPool,
    runtime: Mutex<RuntimeState>,
}

impl AgentServerState {
    pub fn new(app_handle: AppHandle, pool: DbPool) -> Self {
        Self {
            app_handle,
            pool,
            runtime: Mutex::new(RuntimeState {
                handle: None,
                port: None,
                token_hash: None,
            }),
        }
    }

    fn start_or_restart(&self, port: u16, token_hash: String) -> Result<(), String> {
        let mut runtime = self.runtime.lock().map_err(|e| e.to_string())?;

        let already_running = runtime.handle.is_some()
            && runtime.port == Some(port)
            && runtime
                .token_hash
                .as_ref()
                .map(|h| h == &token_hash)
                .unwrap_or(false);

        if already_running {
            return Ok(());
        }

        if let Some(handle) = runtime.handle.take() {
            handle.stop();
        }

        let context = AgentApiContext {
            pool: self.pool.clone(),
            app_handle: Some(self.app_handle.clone()),
            token_hash: token_hash.clone(),
            rate_limiter: Arc::new(middleware::RateLimiter::new(
                100,
                std::time::Duration::from_secs(1),
            )),
        };
        let handle = server::start(context, port)?;

        runtime.port = Some(port);
        runtime.token_hash = Some(token_hash);
        runtime.handle = Some(handle);
        Ok(())
    }

    fn stop(&self) -> Result<(), String> {
        let mut runtime = self.runtime.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = runtime.handle.take() {
            handle.stop();
        }
        runtime.port = None;
        runtime.token_hash = None;
        Ok(())
    }

    pub fn running_port(&self) -> Option<u16> {
        self.runtime.lock().ok().and_then(|state| state.port)
    }

    pub fn is_running(&self) -> bool {
        self.runtime
            .lock()
            .map(|state| state.handle.is_some())
            .unwrap_or(false)
    }
}

impl Drop for AgentServerState {
    fn drop(&mut self) {
        if let Ok(mut runtime) = self.runtime.lock() {
            if let Some(handle) = runtime.handle.take() {
                handle.stop();
            }
        }
    }
}

pub fn bootstrap_runtime(
    db_state: &DbState,
    server_state: &AgentServerState,
) -> Result<(), String> {
    let (enabled, port, token_hash) = {
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        let enabled = get_bool_setting(&conn, KEY_ENABLED, false);
        let port = get_port_setting(&conn);
        let token_hash = if enabled {
            match settings::get(&conn, KEY_TOKEN_HASH).and_then(non_empty) {
                Some(hash) => Some(hash),
                None => {
                    // Self-heal: if API is enabled but token is missing, generate one.
                    let token = auth::generate_token();
                    let hash = auth::hash_token(&token);
                    settings::set(&conn, KEY_TOKEN_HASH, &hash).map_err(|e| e.to_string())?;
                    settings::set(&conn, KEY_TOKEN_PREVIEW, &token_preview(&token))
                        .map_err(|e| e.to_string())?;
                    log::warn!(
                        "Agent API enabled but token was missing; generated a new token hash"
                    );
                    Some(hash)
                }
            }
        } else {
            settings::get(&conn, KEY_TOKEN_HASH).and_then(non_empty)
        };
        (enabled, port, token_hash)
    };

    if enabled {
        let token_hash =
            token_hash.ok_or_else(|| "Agent API enabled but token hash is missing".to_string())?;
        server_state.start_or_restart(port, token_hash)?;
    } else {
        server_state.stop()?;
    }
    Ok(())
}

#[tauri::command]
pub fn agent_get_settings(
    db: State<'_, DbState>,
    server_state: State<'_, AgentServerState>,
) -> Result<AgentApiSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    Ok(read_agent_api_settings(&conn, server_state.is_running()))
}

#[tauri::command]
pub fn agent_save_settings(
    db: State<'_, DbState>,
    server_state: State<'_, AgentServerState>,
    input: SaveAgentApiSettingsInput,
) -> Result<SaveAgentApiSettingsResponse, String> {
    if input.port == 0 {
        return Err("Port must be in range 1..65535".to_string());
    }

    let (token_hash, generated_token) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        settings::set(&conn, KEY_ENABLED, if input.enabled { "1" } else { "0" })
            .map_err(|e| e.to_string())?;
        settings::set(&conn, KEY_PORT, &input.port.to_string()).map_err(|e| e.to_string())?;
        settings::set(
            &conn,
            KEY_AUTO_APPROVE,
            if input.auto_approve { "1" } else { "0" },
        )
        .map_err(|e| e.to_string())?;

        if input.enabled {
            match settings::get(&conn, KEY_TOKEN_HASH).and_then(non_empty) {
                Some(hash) => (Some(hash), None),
                None => {
                    let token = auth::generate_token();
                    let hash = auth::hash_token(&token);
                    settings::set(&conn, KEY_TOKEN_HASH, &hash).map_err(|e| e.to_string())?;
                    settings::set(&conn, KEY_TOKEN_PREVIEW, &token_preview(&token))
                        .map_err(|e| e.to_string())?;
                    (Some(hash), Some(token))
                }
            }
        } else {
            (None, None)
        }
    };

    if input.enabled {
        let token_hash =
            token_hash.ok_or_else(|| "Failed to initialize Agent API token".to_string())?;
        server_state.start_or_restart(input.port, token_hash)?;
    } else {
        server_state.stop()?;
    }

    let settings = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        read_agent_api_settings(&conn, server_state.is_running())
    };

    Ok(SaveAgentApiSettingsResponse {
        settings,
        generated_token,
    })
}

#[tauri::command]
pub fn agent_regenerate_token(
    db: State<'_, DbState>,
    server_state: State<'_, AgentServerState>,
) -> Result<RegenerateTokenResponse, String> {
    let enabled = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        get_bool_setting(&conn, KEY_ENABLED, false)
    };

    if !enabled {
        return Err(
            "Agent API is disabled. Enable Agent API and save settings before regenerating token."
                .to_string(),
        );
    }

    let token = auth::generate_token();
    let token_hash = auth::hash_token(&token);

    let port = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        settings::set(&conn, KEY_TOKEN_HASH, &token_hash).map_err(|e| e.to_string())?;
        settings::set(&conn, KEY_TOKEN_PREVIEW, &token_preview(&token))
            .map_err(|e| e.to_string())?;
        get_port_setting(&conn)
    };

    server_state.start_or_restart(port, token_hash)?;

    let settings = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        read_agent_api_settings(&conn, server_state.is_running())
    };

    Ok(RegenerateTokenResponse { token, settings })
}

fn read_agent_api_settings(conn: &rusqlite::Connection, running: bool) -> AgentApiSettings {
    AgentApiSettings {
        enabled: get_bool_setting(conn, KEY_ENABLED, false),
        port: get_port_setting(conn),
        auto_approve: get_bool_setting(conn, KEY_AUTO_APPROVE, false),
        has_token: settings::get(conn, KEY_TOKEN_HASH)
            .and_then(non_empty)
            .is_some(),
        token_preview: settings::get(conn, KEY_TOKEN_PREVIEW).and_then(non_empty),
        running,
    }
}

fn get_bool_setting(conn: &rusqlite::Connection, key: &str, default: bool) -> bool {
    settings::get(conn, key)
        .and_then(non_empty)
        .map(|value| {
            value.eq_ignore_ascii_case("1")
                || value.eq_ignore_ascii_case("true")
                || value.eq_ignore_ascii_case("yes")
                || value.eq_ignore_ascii_case("on")
        })
        .unwrap_or(default)
}

fn get_port_setting(conn: &rusqlite::Connection) -> u16 {
    settings::get(conn, KEY_PORT)
        .and_then(non_empty)
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0)
        .unwrap_or(DEFAULT_AGENT_API_PORT)
}

fn token_preview(token: &str) -> String {
    if token.len() <= 10 {
        "**********".to_string()
    } else {
        format!("{}...{}", &token[..6], &token[token.len() - 4..])
    }
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
