use active_api::boundary::{ApiError, CreateRoutine, ValidatedJson};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    routing::{get, post},
};
use tower::ServiceExt;

async fn routine(ValidatedJson(body): ValidatedJson<CreateRoutine>) -> Json<CreateRoutine> {
    Json(body)
}
async fn unauthenticated() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "UNAUTHENTICATED",
        "Authentication required",
    )
}
async fn forbidden() -> ApiError {
    ApiError::new(StatusCode::FORBIDDEN, "FORBIDDEN", "Forbidden")
}
async fn absent() -> ApiError {
    ApiError::not_found()
}
async fn conflict() -> ApiError {
    ApiError::stale(3)
}
fn harness() -> Router {
    Router::new()
        .route("/routine", post(routine))
        .route("/unauthenticated", get(unauthenticated))
        .route("/forbidden", get(forbidden))
        .route("/absent", get(absent))
        .route("/conflict", get(conflict))
}
async fn post_body(body: &str) -> (StatusCode, serde_json::Value) {
    let response = harness()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/routine")
                .header("content-type", "application/json")
                .body(Body::from(body.to_owned()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let json =
        serde_json::from_slice(&to_bytes(response.into_body(), 10000).await.unwrap()).unwrap();
    (status, json)
}
#[tokio::test]
async fn routine_boundary_round_trip_and_rejects_invalid_input() {
    let valid = r#"{"name":"Gym","description":null,"pattern":[{"dayIndex":0,"dayType":"REST","workoutId":null},{"dayIndex":1,"dayType":"WORKOUT","workoutId":"a/b"}],"startDate":"2024-02-29"}"#;
    let (status, value) = post_body(valid).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(value["pattern"][0]["workoutId"], serde_json::Value::Null);
    assert_eq!(value["pattern"][1]["workoutId"], "a/b");
    assert_eq!(value["startDate"], "2024-02-29");
    for invalid in [
        valid.replace("2024-02-29", "2023-02-29"),
        valid.replace("\"dayIndex\":1", "\"dayIndex\":2"),
        valid.replace("\"REST\"", "\"OTHER\""),
        valid.replace("\"workoutId\":null", "\"workoutId\":\"id\""),
        valid.replace(",\"workoutId\":null", ""),
        valid.replace("\"Gym\"", "\"  \""),
        valid.replace("\"startDate\"", "\"profileBaseVersion\":null,\"startDate\""),
        valid.replace("\"Gym\"", &format!("\"{}\"", "a".repeat(201))),
        valid.replace("\"startDate\"", "\"unknown\":1,\"startDate\""),
    ] {
        let (status, error) = post_body(&invalid).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{invalid}");
        if let Ok(dir) = std::env::var("ACTIVE_CONTRACT_FIXTURES") {
            std::fs::write(
                format!("{dir}/VALIDATION_ERROR.json"),
                serde_json::to_vec(&error).unwrap(),
            )
            .unwrap();
        }
        assert_eq!(error["code"], "VALIDATION_ERROR");
        assert!(error["field"].is_string());
        assert_eq!(error["message"], "Invalid request");
    }
}
#[tokio::test]
async fn error_policy_harness() {
    for (path, status, code, version) in [
        ("/unauthenticated", 401, "UNAUTHENTICATED", None),
        ("/forbidden", 403, "FORBIDDEN", None),
        ("/absent", 404, "NOT_FOUND", None),
        ("/conflict", 409, "STALE_VERSION", Some(3)),
    ] {
        let response = harness()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
        let value: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 10000).await.unwrap()).unwrap();
        if let Ok(dir) = std::env::var("ACTIVE_CONTRACT_FIXTURES") {
            std::fs::write(
                format!("{dir}/{code}.json"),
                serde_json::to_vec(&value).unwrap(),
            )
            .unwrap();
        }
        assert_eq!(value["code"], code);
        assert_eq!(value["currentVersion"].as_u64(), version);
    }
}

#[test]
fn session_csrf_requires_exact_origin_and_token() {
    use active_api::boundary::check_session_csrf;
    use axum::http::{HeaderMap, HeaderValue};
    let mut headers = HeaderMap::new();
    headers.insert("origin", HeaderValue::from_static("https://active.example"));
    headers.insert("x-csrf-token", HeaderValue::from_static("secret"));
    assert!(check_session_csrf(&headers, "https://active.example", b"secret").is_ok());
    assert!(check_session_csrf(&headers, "https://other.example", b"secret").is_err());
    assert!(check_session_csrf(&headers, "https://active.example", b"wrong").is_err());
    headers.append("origin", HeaderValue::from_static("https://active.example"));
    assert!(check_session_csrf(&headers, "https://active.example", b"secret").is_err());
}
