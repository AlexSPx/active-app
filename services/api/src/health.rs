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
    let catalog = sqlx::query_scalar::<_, i64>("SELECT 1 FROM catalog_metadata WHERE singleton=1 AND EXISTS (SELECT 1 FROM exercises WHERE retired=0) AND NOT EXISTS (SELECT 1 FROM exercises e WHERE NOT EXISTS (SELECT 1 FROM exercise_source_keys m WHERE m.dataset_version=e.dataset_version AND m.source_key=e.source_key AND m.exercise_id=e.id)) AND NOT EXISTS (SELECT 1 FROM exercise_source_keys GROUP BY source_key HAVING count(DISTINCT exercise_id)>1)")
        .fetch_optional(&state.pool)
        .await
        .is_ok_and(|value| value.is_some());
    let auth = state.discovery.read().await.is_some();
    let draining = state.draining.load(Ordering::SeqCst);
    let status = if database && catalog && auth && !draining {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status, Json(serde_json::json!({"status": if status == StatusCode::OK { "ready" } else { "not_ready" }, "database": database, "catalog": catalog, "auth": auth, "draining": draining}))).into_response()
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
