use super::{auth, AgentApiContext};
use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct RateLimiter {
    max_requests: usize,
    window: Duration,
    timestamps: Mutex<VecDeque<Instant>>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            timestamps: Mutex::new(VecDeque::new()),
        }
    }

    pub fn try_acquire(&self) -> bool {
        let now = Instant::now();
        let mut timestamps = match self.timestamps.lock() {
            Ok(lock) => lock,
            Err(_) => return false,
        };

        while let Some(oldest) = timestamps.front() {
            if now.duration_since(*oldest) >= self.window {
                timestamps.pop_front();
            } else {
                break;
            }
        }

        if timestamps.len() >= self.max_requests {
            return false;
        }

        timestamps.push_back(now);
        true
    }
}

pub async fn require_bearer(
    State(state): State<AgentApiContext>,
    request: Request,
    next: Next,
) -> Response {
    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(auth::parse_bearer_token);

    let Some(token) = token else {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "AUTH_UNAUTHORIZED",
            "Missing or invalid Authorization header",
        );
    };

    if !auth::verify_token(&state.token_hash, token) {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "AUTH_UNAUTHORIZED",
            "Invalid API token",
        );
    }

    next.run(request).await
}

pub async fn rate_limit(
    State(state): State<AgentApiContext>,
    request: Request,
    next: Next,
) -> Response {
    if !state.rate_limiter.try_acquire() {
        return json_error(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Too many requests. Limit is 100 req/sec.",
        );
    }

    next.run(request).await
}

fn json_error(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        axum::Json(json!({
            "error": {
                "code": code,
                "message": message
            }
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::RateLimiter;
    use std::time::Duration;

    #[test]
    fn test_rate_limiter_rejects_requests_over_limit() {
        let limiter = RateLimiter::new(100, Duration::from_secs(1));

        for _ in 0..100 {
            assert!(limiter.try_acquire());
        }
        assert!(!limiter.try_acquire());
    }
}
