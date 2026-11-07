use active_api::{app, bootstrap_auth, config::Config, db, initialize, start_draining};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    routing::get,
};
use std::{net::SocketAddr, time::Duration};
use tower::ServiceExt;
use url::Url;

#[tokio::test]
async fn readiness_identity_discovery_and_limits() {
    let dir = tempfile::tempdir().unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let provider_issuer = issuer.clone();
    let provider = Router::new().route("/.well-known/openid-configuration", get(move || {
        let issuer = provider_issuer.clone();
        async move { axum::Json(serde_json::json!({"issuer": issuer, "authorization_endpoint": format!("{issuer}/authorize"), "token_endpoint": format!("{issuer}/token"), "end_session_endpoint": format!("{issuer}/logout")})) }
    }));
    let task = tokio::spawn(async move { axum::serve(listener, provider).await.unwrap() });
    let config = Config {
        listen: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        database: dir.path().join("db"),
        external_url: Url::parse("http://localhost").unwrap(),
        origins: vec![Url::parse("http://localhost").unwrap()],
        issuer: Url::parse(&issuer).unwrap(),
        body_limit: 4,
        request_timeout: Duration::from_secs(1),
        shutdown_timeout: Duration::from_secs(2),
    };
    let pool = db::open(&config.database).await.unwrap();
    let state = initialize(pool.clone(), &config).await.unwrap();
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .uri("/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(response.headers().contains_key("x-request-id"));
    for (origin, expected) in [
        ("http://localhost", StatusCode::NO_CONTENT),
        ("https://evil.example", StatusCode::FORBIDDEN),
    ] {
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/api/routines")
                    .header("origin", origin)
                    .header("access-control-request-method", "POST")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .is_some(),
            expected == StatusCode::NO_CONTENT
        );
        assert!(
            response
                .headers()
                .get("access-control-allow-credentials")
                .is_none()
        );
        assert!(response.headers().contains_key("x-request-id"));
    }
    bootstrap_auth(&state, &config.issuer, &reqwest::Client::new())
        .await
        .unwrap();
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .uri("/.well-known/active")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let json: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
    if let Ok(dir) = std::env::var("ACTIVE_CONTRACT_FIXTURES") {
        std::fs::write(
            format!("{dir}/discovery.json"),
            serde_json::to_vec(&json).unwrap(),
        )
        .unwrap();
    }
    assert_eq!(json["issuer"], issuer);
    assert_eq!(json["contractVersion"], "1");
    let id = json["instanceId"].as_str().unwrap().to_owned();
    assert!(uuid::Uuid::parse_str(&id).is_ok());
    for version in [None, Some("2"), Some("invalid")] {
        let mut request = Request::builder().uri("/api/history/revision");
        if let Some(version) = version {
            request = request.header("x-active-contract-version", version);
        }
        let response = app(state.clone())
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UPGRADE_REQUIRED);
        assert!(response.headers().contains_key("x-request-id"));
        let json: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
        if let Ok(dir) = std::env::var("ACTIVE_CONTRACT_FIXTURES") {
            std::fs::write(
                format!("{dir}/error.json"),
                serde_json::to_vec(&json).unwrap(),
            )
            .unwrap();
        }
        assert_eq!(
            json,
            serde_json::json!({"code":"INCOMPATIBLE_VERSION", "message":"Unsupported contract version", "currentVersion":null})
        );
    }
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .uri("/api/history/revision")
                .header("x-active-contract-version", "1")
                .header("x-active-contract-version", "1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UPGRADE_REQUIRED);
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .uri("/api/history/revision")
                .header("x-active-contract-version", "1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/health")
                .body(Body::from("12345"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(response.headers()["allow"], "GET,HEAD");
    assert_eq!(response.headers()["content-type"], "application/json");
    let json: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
    assert_eq!(
        json,
        serde_json::json!({"code": "METHOD_NOT_ALLOWED", "message": "Method not allowed", "currentVersion": null})
    );
    start_draining(&state);
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .uri("/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    drop(state);
    pool.close().await;
    let pool = db::open(&config.database).await.unwrap();
    let restarted = initialize(pool.clone(), &config).await.unwrap();
    let persisted: String = sqlx::query_scalar("SELECT instance_id FROM instance_metadata")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(id, persisted);
    assert!(restarted.discovery.read().await.is_none());
    task.abort();
}
