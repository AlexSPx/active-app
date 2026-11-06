use crate::{AppState, error};
use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::sync::atomic::Ordering;

#[derive(Serialize)]
pub(crate) struct Health {
    status: &'static str,
}

pub async fn live() -> Json<Health> {
    Json(Health { status: "ok" })
}

pub async fn ready(State(state): State<AppState>) -> Response {
    let database = sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .is_ok();
    let auth = state.discovery.read().await.is_some();
    let draining = state.draining.load(Ordering::SeqCst);
    let status = if database && auth && !draining {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status, Json(serde_json::json!({"status": if status == StatusCode::OK { "ready" } else { "not_ready" }, "database": database, "auth": auth, "draining": draining}))).into_response()
}

pub async fn discovery(State(state): State<AppState>) -> Response {
    match state.discovery.read().await.clone() {
        Some(discovery) => Json(discovery).into_response(),
        None => error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "Service unavailable",
        ),
    }
}
