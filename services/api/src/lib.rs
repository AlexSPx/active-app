pub mod auth;
pub mod boundary;
pub mod config;
pub mod db;
mod health;
pub mod profile;
pub mod profile_http;
pub mod requests;
pub mod responses;
pub mod web_auth;

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    pub instance_id: String,
    pub contract_version: &'static str,
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub end_session_endpoint: String,
}

#[derive(Deserialize)]
struct Provider {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    end_session_endpoint: String,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub auth: auth::AuthState,
    pub discovery: Arc<RwLock<Option<Discovery>>>,
    pub draining: Arc<AtomicBool>,
    pub body_limit: usize,
    pub request_timeout: Duration,
    pub origins: Vec<String>,
}

pub async fn initialize(
    pool: SqlitePool,
    config: &config::Config,
) -> Result<AppState, sqlx::Error> {
    sqlx::query("INSERT INTO instance_metadata(singleton, instance_id) VALUES(1, ?) ON CONFLICT(singleton) DO NOTHING")
        .bind(Uuid::new_v4().to_string()).execute(&pool).await?;
    let identity: String =
        sqlx::query_scalar("SELECT instance_id FROM instance_metadata WHERE singleton=1")
            .fetch_one(&pool)
            .await?;
    if Uuid::parse_str(&identity).is_err() {
        return Err(sqlx::Error::Protocol(
            "invalid stored instance identity".into(),
        ));
    }
    Ok(AppState {
        pool,
        auth: auth::AuthState::default(),
        discovery: Arc::new(RwLock::new(None)),
        draining: Arc::new(AtomicBool::new(false)),
        body_limit: config.body_limit,
        request_timeout: config.request_timeout,
        origins: config
            .origins
            .iter()
            .map(|url| url.origin().ascii_serialization())
            .collect(),
    })
}

pub async fn bootstrap_auth(
    state: &AppState,
    issuer: &url::Url,
    client: &reqwest::Client,
) -> Result<(), &'static str> {
    let instance_id: String =
        sqlx::query_scalar("SELECT instance_id FROM instance_metadata WHERE singleton=1")
            .fetch_one(&state.pool)
            .await
            .map_err(|_| "database unavailable")?;
    let metadata_url = format!(
        "{}/.well-known/openid-configuration",
        issuer.as_str().trim_end_matches('/')
    );
    let mut response = client
        .get(metadata_url)
        .send()
        .await
        .map_err(|_| "issuer unavailable")?;
    if !response.status().is_success() {
        return Err("issuer unavailable");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "issuer metadata unavailable")?
    {
        if bytes.len() + chunk.len() > 65536 {
            return Err("issuer metadata too large");
        }
        bytes.extend_from_slice(&chunk);
    }
    let provider: Provider =
        serde_json::from_slice(&bytes).map_err(|_| "invalid issuer metadata")?;
    if provider.issuer != issuer.as_str().trim_end_matches('/')
        && provider.issuer != issuer.as_str()
    {
        return Err("issuer mismatch");
    }
    if ![
        &provider.authorization_endpoint,
        &provider.token_endpoint,
        &provider.end_session_endpoint,
    ]
    .iter()
    .all(|s| config::endpoint(s) && url::Url::parse(s).is_ok_and(|u| u.origin() == issuer.origin()))
    {
        return Err("invalid issuer endpoints");
    }
    *state.discovery.write().await = Some(Discovery {
        instance_id,
        contract_version: "1",
        issuer: provider.issuer,
        authorization_endpoint: provider.authorization_endpoint,
        token_endpoint: provider.token_endpoint,
        end_session_endpoint: provider.end_session_endpoint,
    });
    Ok(())
}

fn error(status: StatusCode, code: &'static str, message: &'static str) -> Response {
    boundary::ApiError::new(status, code, message).into_response()
}

async fn operational(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let id = Uuid::new_v4().to_string();
    let origin = request.headers().get_all("origin");
    let allowed_origin = if origin.iter().count() == 1 {
        origin
            .iter()
            .next()
            .and_then(|value| value.to_str().ok())
            .filter(|value| state.origins.iter().any(|allowed| allowed == *value))
            .map(str::to_owned)
    } else {
        None
    };
    let preflight = request.method() == axum::http::Method::OPTIONS
        && request
            .headers()
            .contains_key("access-control-request-method");
    let method = match *request.method() {
        axum::http::Method::GET => "GET",
        axum::http::Method::POST => "POST",
        axum::http::Method::PUT => "PUT",
        axum::http::Method::PATCH => "PATCH",
        axum::http::Method::DELETE => "DELETE",
        _ => "OTHER",
    };
    // Never record a path, query, headers or body: they may contain private data.
    let result = tokio::time::timeout(state.request_timeout, async {
        let (parts, body) = request.into_parts();
        if !preflight
            && (parts.uri.path() == "/api" || parts.uri.path().starts_with("/api/"))
            && (parts
                .headers
                .get_all("x-active-contract-version")
                .iter()
                .count()
                != 1
                || parts.headers.get("x-active-contract-version")
                    != Some(&HeaderValue::from_static("1")))
        {
            return error(
                StatusCode::UPGRADE_REQUIRED,
                "INCOMPATIBLE_VERSION",
                "Unsupported contract version",
            );
        }
        if preflight {
            return if allowed_origin.is_some() {
                StatusCode::NO_CONTENT.into_response()
            } else {
                error(StatusCode::FORBIDDEN, "FORBIDDEN", "Origin not allowed")
            };
        }
        match to_bytes(body, state.body_limit).await {
            Ok(body) => next.run(Request::from_parts(parts, Body::from(body))).await,
            Err(_) => error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "PAYLOAD_TOO_LARGE",
                "Request body exceeds limit",
            ),
        }
    })
    .await;
    let mut response = result.unwrap_or_else(|_| {
        error(
            StatusCode::REQUEST_TIMEOUT,
            "REQUEST_TIMEOUT",
            "Request timed out",
        )
    });
    response
        .headers_mut()
        .insert("vary", HeaderValue::from_static("Origin"));
    if let Some(origin) = allowed_origin {
        let headers = response.headers_mut();
        headers.insert(
            "access-control-allow-origin",
            HeaderValue::from_str(&origin).expect("validated origin"),
        );
        headers.insert(
            "access-control-expose-headers",
            HeaderValue::from_static("x-request-id"),
        );
        if preflight {
            headers.insert(
                "access-control-allow-methods",
                HeaderValue::from_static("GET, POST, PUT, PATCH, DELETE"),
            );
            headers.insert(
                "access-control-allow-headers",
                HeaderValue::from_static(
                    "authorization, content-type, idempotency-key, x-active-contract-version",
                ),
            );
        }
    }
    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&id).expect("UUID is a valid header"),
    );
    response
        .headers_mut()
        .insert("cache-control", HeaderValue::from_static("no-store"));
    tracing::info!(request_id = %id, method = %method, status = response.status().as_u16(), "request completed");
    response
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .merge(profile_http::routes())
        .route("/auth/login", get(web_auth::login))
        .route("/auth/callback", get(web_auth::callback))
        .route("/auth/session", get(web_auth::session))
        .route("/auth/logout", axum::routing::post(web_auth::logout))
        .route("/auth/native/identity", get(auth::native_identity))
        .route("/auth/config", get(auth::native_config))
        .route(
            "/auth/native/verify",
            axum::routing::post(auth::native_verify),
        )
        .route("/health", get(health::live))
        .route("/ready", get(health::ready))
        .route("/.well-known/active", get(health::discovery))
        .fallback(|| async { error(StatusCode::NOT_FOUND, "NOT_FOUND", "Not found") })
        .method_not_allowed_fallback(|| async {
            error(
                StatusCode::METHOD_NOT_ALLOWED,
                "METHOD_NOT_ALLOWED",
                "Method not allowed",
            )
        })
        .layer(middleware::from_fn_with_state(state.clone(), operational))
        .with_state(state)
}

pub fn start_draining(state: &AppState) {
    state.draining.store(true, Ordering::SeqCst);
}
