use active_api::{
    AppState,
    auth::{AuthConfig, AuthState},
    db, profile_http,
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    routing::get,
};
use serde_json::{Value, json};
use std::{
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};
use tempfile::TempDir;
use tokio::sync::RwLock;
use tower::ServiceExt;

const KEY: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCjEQIAzMzKzEji
XHhgmFpwVhOfCFIURs+8gbdcRr/AYbC4yGdhcoUsNwUSeIAou+WzEhAUuIiVPcnR
JnTB/fFCGs1dnTpkRrogpbjke4ukl6n/BhmYcmIjE2K90if8BYG3BSHeobWXkHAi
yrZL0lTWUqRAgXGegwEKhcgGiBJFG1tl6zxWctUs2uQXpLbPKVGUcvXgpVZP44Oq
IESjalLu+T6vuId1Dygy1rSsrlMHItBpKueFWZq7cZFWlaJstQyHh/VEhBwDC9Ve
BH+V2G0ySQE07V0nGIlmQHcSeZXjWGe7/qf73JYsJPxlNhNAkC8XH14GTJEQRCM2
c6MHy7rTAgMBAAECggEAKE7j996oINkuiwXgm8ANWwdsAjvETk7Suv41nRHABIYh
cQvYwjXUxYE0N8ShqXAI76LfZr/Ww01qvdCLvAhRws1tRl6/OFpjV/6fHZuMgTsc
QnX3jb94ksMP/Wwdhia2Uc9q9+VxRe3mSjNhrIxpfDEhePCGbXBkqX04XKT2Hy6m
mFwuYrUpoyxOSfubhZ1V8z/JUkNI+FEhu52VhfOrPb7RU5k1KqxgrSeichm/6PHo
IwG+J/nyL13xWvfWoBU/YwwwljN67x76aCS5iRDAn9VBTOiiqkil0zzCH4FBckwT
jU8p6QbfLcyH1tpHC0ES5tZf+o1nZvTpEJaMX87gQQKBgQDfSnli0zZjPkTdAOGu
2+qwxdCfiQeP47B5S9NYyYXMNfsRsLUNvDvf22R72IfJppKVCQr8oQwCYV9NRGUE
WifuQI697xP4kkaqxeTeP5Jd1CsdpTcTicbW/Tv47Pswz4QWbVP/bxBZ1dV0Z+a1
cyCcAtOgYylgFLopQ4xBIxZLfQKBgQC69BWVQ3boooOMHAqfws/0XINKzkBtHQcD
l9UOr+cJKlveEnEyG2iICG3NuUiDA31g2DGZEjEd1JHwPYh0OpCqmTdbc7bqYlP/
HqXciU+kJ4l0Rx3VAmcPZM4MLMXOlPFtmnm/DLjj5Vv1KaZgXrC1uD36z0ygShqZ
qBHH8KrQjwKBgQCJi2SunZCZHZhp0ssyXUF6VsAmJdDEr+rbLPwpaynCG1ZnFUTS
CyuOv6RsLXunmbYdnA5qhAHTzYtZG1JmleqW9ql3EjhpHCHvvCs5REuzBKjyf/0n
Se10LVWuBrzM2mdxMTNW22FlFTWBmSciiqKBt7QIzkyEZQAvvu48iZKIOQKBgQCg
UvW3XXW5prR9EQcjXqOLgVKuchXZ/MypDioOQFc3CvZhiRs9xzdrgR75D23ZvMJm
rMBL7sfkNwk4JuzAEAFD68UHTkKM2eoCnLvMVozPz4AXEW3J4BeVofL5iePQdvZb
8d96MWTVOzoTEra1aj7Md8XfMqsZwrLxFqq49fDmjQKBgQCLnkcsIEi6w3jNcwe+
Abp06kgQlGyC435tcOvQQHzL2pFUjHKxZZ171q46hl38W38+ueYbfaWHfUUVfyGZ
L5KKU3I4nmSWDaJVX6DsPTAqiRmtXKwLyztn+mZlfvem/2QMpi6HTP4iOFa/Hr86
Gzb+oJtz6WnP7djUGyrgShB3lg==
-----END PRIVATE KEY-----
"#;
const MODULUS: &str = "oxECAMzMysxI4lx4YJhacFYTnwhSFEbPvIG3XEa_wGGwuMhnYXKFLDcFEniAKLvlsxIQFLiIlT3J0SZ0wf3xQhrNXZ06ZEa6IKW45HuLpJep_wYZmHJiIxNivdIn_AWBtwUh3qG1l5BwIsq2S9JU1lKkQIFxnoMBCoXIBogSRRtbZes8VnLVLNrkF6S2zylRlHL14KVWT-ODqiBEo2pS7vk-r7iHdQ8oMta0rK5TByLQaSrnhVmau3GRVpWibLUMh4f1RIQcAwvVXgR_ldhtMkkBNO1dJxiJZkB3EnmV41hnu_6n-9yWLCT8ZTYTQJAvFx9eBkyREEQjNnOjB8u60w";

async fn call(
    state: &AppState,
    token: &str,
    method: &str,
    path: &str,
    key: Option<&str>,
    body: &str,
) -> (StatusCode, Value) {
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json");
    if let Some(key) = key {
        req = req.header("idempotency-key", key);
    }
    let response = profile_http::routes()
        .with_state(state.clone())
        .oneshot(req.body(Body::from(body.to_owned())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}
fn token(issuer: &str, sub: &str) -> String {
    let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
    header.kid = Some("test".into());
    header.typ = Some("at+jwt".into());
    jsonwebtoken::encode(&header, &json!({"iss":issuer,"sub":sub,"aud":"api","exp":chrono::Utc::now().timestamp()+3600,"email":"test@example.com","email_verified":true}), &jsonwebtoken::EncodingKey::from_rsa_pem(KEY.as_bytes()).unwrap()).unwrap()
}
#[tokio::test]
async fn authenticated_receipts_replay_and_deletion_fence() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let metadata = json!({"issuer":issuer,"jwks_uri":format!("{issuer}/jwks")});
    let jwks = json!({"keys":[{"kty":"RSA","kid":"test","alg":"RS256","use":"sig","n":MODULUS,"e":"AQAB"}]});
    let server = Router::new()
        .route(
            "/.well-known/openid-configuration",
            get(move || async move { Json(metadata.clone()) }),
        )
        .route("/jwks", get(move || async move { Json(jwks.clone()) }));
    let task = tokio::spawn(async move {
        axum::serve(listener, server).await.unwrap();
    });
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("db.sqlite");
    let pool = db::open(&path).await.unwrap();
    let state = AppState {
        pool: pool.clone(),
        auth: AuthState::new(AuthConfig {
            issuer: issuer.clone(),
            client_id: "client".into(),
            resource: "api".into(),
            redirect_uri: "active://callback".into(),
        }),
        discovery: Arc::new(RwLock::new(None)),
        draining: Arc::new(AtomicBool::new(false)),
        body_limit: 4096,
        request_timeout: Duration::from_secs(5),
        origins: vec![],
    };
    active_api::catalog::seed(&pool).await.unwrap();
    for (path, expected) in [
        ("/api/exercises/catalog", 876),
        ("/api/exercises/search?name=bench", 0),
    ] {
        let response = active_api::catalog::routes()
            .with_state(state.clone())
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header(
                        "authorization",
                        format!("Bearer {}", token(&issuer, "alice")),
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 4_000_000).await.unwrap())
                .unwrap();
        let items = if path.contains("catalog") {
            body["items"].as_array().unwrap()
        } else {
            body.as_array().unwrap()
        };
        if path.contains("catalog") {
            assert_eq!(items.len(), expected);
        } else {
            assert!(!items.is_empty());
            assert!(items.iter().all(|item| {
                item["name"]
                    .as_str()
                    .unwrap()
                    .to_lowercase()
                    .contains("bench")
            }));
        }
        assert!(
            items
                .windows(2)
                .all(|pair| pair[0]["sourceKey"].as_str() < pair[1]["sourceKey"].as_str())
        );
    }
    let alice = token(&issuer, "alice");
    let bob = token(&issuer, "bob");
    assert_eq!(
        call(
            &state,
            &alice,
            "PATCH",
            "/api/user/me",
            Some("before"),
            r#"{"baseVersion":1}"#
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&state, &alice, "GET", "/api/user/me", None, "")
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&state, &bob, "GET", "/api/user/me", None, "").await.0,
        StatusCode::OK
    );
    let body = r#"{"baseVersion":1,"firstName":"Alice"}"#;
    let (a, b) = tokio::join!(
        call(&state, &alice, "PATCH", "/api/user/me", Some("one"), body),
        call(&state, &alice, "PATCH", "/api/user/me", Some("one"), body)
    );
    assert_eq!(a.0, StatusCode::OK);
    assert_eq!(a, b);
    assert_eq!(a.1["profileVersion"], 2);
    assert_eq!(
        call(
            &state,
            &alice,
            "PATCH",
            "/api/user/me",
            Some("one"),
            r#"{"baseVersion":1}"#
        )
        .await
        .1["code"],
        "IDEMPOTENCY_KEY_REUSED"
    );
    assert_eq!(
        call(&state, &alice, "PATCH", "/api/user/me", Some("other"), body)
            .await
            .1["code"],
        "STALE_VERSION"
    );
    let pref = r#"{"baseVersion":0,"enabled":true,"timezone":"UTC","schedule":["09:00"]}"#;
    let first = call(
        &state,
        &alice,
        "PUT",
        "/api/reminder-preferences",
        Some("pref"),
        pref,
    )
    .await;
    assert_eq!(first.0, StatusCode::OK);
    assert_eq!(
        call(
            &state,
            &alice,
            "PUT",
            "/api/reminder-preferences",
            Some("pref"),
            pref
        )
        .await,
        first
    );
    assert_eq!(
        call(&state, &bob, "GET", "/api/reminder-preferences", None, "")
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    // Failed attempts do not consume a key; another owner can use the same key.
    let stale = call(
        &state,
        &alice,
        "PATCH",
        "/api/user/me",
        Some("retry-stale"),
        body,
    )
    .await;
    assert_eq!(stale.1["code"], "STALE_VERSION");
    let corrected = call(
        &state,
        &alice,
        "PATCH",
        "/api/user/me",
        Some("retry-stale"),
        r#"{"baseVersion":2,"lastName":"Updated"}"#,
    )
    .await;
    assert_eq!(corrected.1["profileVersion"], 3);
    let bob_result = call(
        &state,
        &bob,
        "PATCH",
        "/api/user/me",
        Some("one"),
        r#"{"baseVersion":1,"firstName":"Bob"}"#,
    )
    .await;
    assert_eq!(bob_result.0, StatusCode::OK);

    assert_eq!(
        call(
            &state,
            &alice,
            "PUT",
            "/api/reminder-preferences",
            Some("one"),
            pref
        )
        .await
        .1["code"],
        "IDEMPOTENCY_KEY_REUSED"
    );
    let (left, right) = tokio::join!(
        call(
            &state,
            &bob,
            "PATCH",
            "/api/user/me",
            Some("left"),
            r#"{"baseVersion":2,"lastName":"Left"}"#
        ),
        call(
            &state,
            &bob,
            "PATCH",
            "/api/user/me",
            Some("right"),
            r#"{"baseVersion":2,"lastName":"Right"}"#
        )
    );
    assert!(
        (left.0 == StatusCode::OK && right.1["code"] == "STALE_VERSION")
            || (right.0 == StatusCode::OK && left.1["code"] == "STALE_VERSION")
    );

    // Receipt and child rows roll back with the preferences update.
    sqlx::query("CREATE TRIGGER fail_time BEFORE INSERT ON reminder_times BEGIN SELECT RAISE(ABORT,'failure'); END")
        .execute(&pool).await.unwrap();
    let changed_pref = r#"{"baseVersion":1,"enabled":true,"timezone":"UTC","schedule":["10:00"]}"#;
    assert_eq!(
        call(
            &state,
            &alice,
            "PUT",
            "/api/reminder-preferences",
            Some("rollback"),
            changed_pref
        )
        .await
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        call(&state, &alice, "GET", "/api/reminder-preferences", None, "")
            .await
            .1,
        first.1
    );
    sqlx::query("DROP TRIGGER fail_time")
        .execute(&pool)
        .await
        .unwrap();
    let updated_pref = call(
        &state,
        &alice,
        "PUT",
        "/api/reminder-preferences",
        Some("rollback"),
        changed_pref,
    )
    .await;
    assert_eq!(updated_pref.0, StatusCode::OK);
    let mut reopened = state.clone();
    reopened.pool = db::open(&path).await.unwrap();
    assert_eq!(
        call(
            &reopened,
            &alice,
            "PUT",
            "/api/reminder-preferences",
            Some("rollback"),
            changed_pref
        )
        .await,
        updated_pref
    );

    let lock = db::begin_write(&pool).await.unwrap();
    let busy = call(
        &state,
        &alice,
        "PATCH",
        "/api/user/me",
        Some("locked"),
        r#"{"baseVersion":3,"firstName":"After lock"}"#,
    )
    .await;
    assert_eq!(busy.0, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(busy.1["code"], "DATABASE_BUSY");
    lock.rollback().await.unwrap();
    assert_eq!(
        call(
            &state,
            &alice,
            "PATCH",
            "/api/user/me",
            Some("locked"),
            r#"{"baseVersion":3}"#
        )
        .await
        .0,
        StatusCode::OK
    );
    sqlx::query(
        "CREATE TRIGGER fail_delete AFTER DELETE ON users BEGIN SELECT RAISE(ABORT,'failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        call(
            &state,
            &alice,
            "DELETE",
            "/api/user/me?baseVersion=3",
            Some("delete"),
            ""
        )
        .await
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    sqlx::query("DROP TRIGGER fail_delete")
        .execute(&pool)
        .await
        .unwrap();
    let deleted = call(
        &state,
        &alice,
        "DELETE",
        "/api/user/me?baseVersion=3",
        Some("delete"),
        "",
    )
    .await;
    assert_eq!(deleted.0, StatusCode::OK);
    let mut restarted = state.clone();
    restarted.pool = db::open(&path).await.unwrap();
    assert_eq!(
        call(
            &restarted,
            &alice,
            "DELETE",
            "/api/user/me?baseVersion=3",
            Some("delete"),
            ""
        )
        .await,
        deleted
    );
    assert_eq!(
        call(
            &restarted,
            &alice,
            "DELETE",
            "/api/user/me?baseVersion=1",
            Some("delete"),
            ""
        )
        .await
        .1["code"],
        "IDEMPOTENCY_KEY_REUSED"
    );
    assert_eq!(
        call(&restarted, &alice, "GET", "/api/user/me", None, "")
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&restarted, &bob, "GET", "/api/user/me", None, "")
            .await
            .0,
        StatusCode::OK
    );
    task.abort();
}
