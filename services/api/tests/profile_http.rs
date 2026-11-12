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
    let (status, bytes) = call_raw(state, token, method, path, key, body).await;
    (status, serde_json::from_slice(&bytes).unwrap())
}

async fn call_raw(
    state: &AppState,
    token: &str,
    method: &str,
    path: &str,
    key: Option<&str>,
    body: &str,
) -> (StatusCode, Vec<u8>) {
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
    (status, bytes.to_vec())
}
async fn workout_call(
    state: &AppState,
    token: &str,
    method: &str,
    path: &str,
    key: Option<&str>,
    body: &str,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json");
    if let Some(key) = key {
        request = request.header("idempotency-key", key);
    }
    let response = active_api::workouts::routes()
        .with_state(state.clone())
        .oneshot(request.body(Body::from(body.to_owned())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    (
        status,
        serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap(),
    )
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
    let updated_pref = call_raw(
        &state,
        &alice,
        "PUT",
        "/api/reminder-preferences",
        Some("rollback"),
        changed_pref,
    )
    .await;
    assert_eq!(updated_pref.0, StatusCode::OK);
    pool.close().await;
    let pool = db::open(&path).await.unwrap();
    let mut state = state;
    state.pool = pool.clone();
    assert_eq!(
        call_raw(
            &state,
            &alice,
            "PUT",
            "/api/reminder-preferences",
            Some("rollback"),
            changed_pref
        )
        .await,
        updated_pref
    );
    let durable: (i64, i64) = sqlx::query_as("SELECT version, (SELECT count(*) FROM reminder_times WHERE owner_id=reminder_preferences.owner_id) FROM reminder_preferences WHERE owner_id=(SELECT user_id FROM identities WHERE subject='alice')")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(durable, (2, 1));

    let owner: String = sqlx::query_scalar("SELECT user_id FROM identities WHERE subject='alice'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let exercise: String = sqlx::query_scalar("SELECT id FROM exercises LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    let create = json!({"title":"Workout", "notes":"note", "template":{"exercises":[{"exerciseId":exercise,"notes":"private exercise note","reps":[8,4],"weight":[10.0,12.0],"durationSeconds":[30.0,45.0]},{"exerciseId":exercise,"notes":"second entry","reps":[],"weight":[],"durationSeconds":[12.0]}]}}).to_string();
    let created = workout_call(
        &state,
        &alice,
        "POST",
        "/api/workouts",
        Some("workout-create"),
        &create,
    )
    .await;
    assert_eq!(created.0, StatusCode::CREATED);
    assert_eq!(
        workout_call(
            &state,
            &alice,
            "POST",
            "/api/workouts",
            Some("workout-create"),
            &create
        )
        .await,
        created
    );
    let _: active_api::responses::Workout = serde_json::from_value(created.1.clone()).unwrap();
    assert_eq!(
        workout_call(
            &state,
            &alice,
            "POST",
            "/api/workouts",
            Some("workout-create"),
            r#"{"title":"other","template":{"exercises":[]}}"#
        )
        .await
        .1["code"],
        "IDEMPOTENCY_KEY_REUSED"
    );
    assert_eq!(
        workout_call(
            &state,
            &alice,
            "POST",
            "/api/workouts",
            Some("bad-exercise"),
            r#"{"title":"bad","template":{"exercises":[{"exerciseId":"missing"}]}}"#
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let clear_created = workout_call(
        &state,
        &alice,
        "POST",
        "/api/workouts",
        Some("clear-create"),
        &create,
    )
    .await;
    let clear_path = format!("/api/workouts/{}", clear_created.1["id"].as_str().unwrap());
    let cleared = workout_call(
        &state,
        &alice,
        "PUT",
        &clear_path,
        Some("clear-template"),
        r#"{"baseVersion":1,"template":{"exercises":[]}}"#,
    )
    .await;
    assert_eq!(cleared.1["workoutTemplate"]["exercises"], json!([]));
    assert_eq!(cleared.1["version"], 2);
    assert_eq!(
        workout_call(&state, &alice, "GET", "/api/workouts", None, "")
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        workout_call(&state, &bob, "GET", "/api/workouts", None, "")
            .await
            .1,
        json!([])
    );
    let id = created.1["id"].as_str().unwrap();
    let workout_path = format!("/api/workouts/{id}");
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT notes FROM workout_exercises WHERE workout_id=?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap(),
        "private exercise note"
    );
    let listed = workout_call(&state, &alice, "GET", "/api/workouts", None, "").await;
    let persisted = listed
        .1
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["id"] == id)
        .unwrap();
    assert_eq!(
        persisted["workoutTemplate"]["exercises"][0]["notes"],
        "private exercise note"
    );
    let entry = &created.1["workoutTemplate"]["exercises"][0];
    assert_eq!(entry["reps"], json!([8, 4]));
    assert_eq!(entry["durationSeconds"], json!([30.0, 45.0]));
    assert_eq!(
        persisted["workoutTemplate"]["exercises"][1]["notes"],
        "second entry"
    );
    assert_eq!(
        persisted["workoutTemplate"]["exercises"][1]["durationSeconds"],
        json!([12.0])
    );
    assert_eq!(entry["notes"], "private exercise note");
    assert_eq!(
        workout_call(
            &state,
            &bob,
            "PUT",
            &workout_path,
            Some("bob-edit"),
            r#"{"baseVersion":1,"title":"stolen"}"#
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let updated = workout_call(
        &state,
        &alice,
        "PUT",
        &workout_path,
        Some("workout-edit"),
        r#"{"baseVersion":1,"notes":null}"#,
    )
    .await;
    assert_eq!(updated.1["version"], 2);
    assert_eq!(updated.1["notes"], Value::Null);
    assert_eq!(
        updated.1["workoutTemplate"]["id"],
        created.1["workoutTemplate"]["id"]
    );
    assert_eq!(
        workout_call(
            &state,
            &alice,
            "PUT",
            &workout_path,
            Some("stale"),
            r#"{"baseVersion":1,"title":"old"}"#
        )
        .await
        .1["code"],
        "STALE_VERSION"
    );
    let timestamp = "2026-01-01T00:00:00Z";
    sqlx::query("INSERT INTO routines(id,owner_id,name,routine_type,start_date,created_at) VALUES('routine',?,'R','SEQUENTIAL','2026-01-01',?)").bind(&owner).bind(timestamp).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO routine_pattern VALUES(?,'routine',0,'WORKOUT',?)")
        .bind(&owner)
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO client_record_ids VALUES(?,'client')")
        .bind(&owner)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO workout_records(id,owner_id,client_record_id,workout_id,workout_title,start_time,completed_at,completion_timezone,created_at) VALUES('record',?,'client',?,'snapshot',?,?,'UTC',?)").bind(&owner).bind(id).bind(timestamp).bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO streak_snapshots(owner_id,version,history_revision,rules_version,current_streak,longest_streak,next_workout_id,next_workout_deadline,streak_freeze_count) VALUES(?,1,0,'v1',1,1,?,'2026-01-02',0)").bind(&owner).bind(id).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO streak_weekly_workouts VALUES(?,0,?)")
        .bind(&owner)
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("CREATE TRIGGER fail_workout_delete BEFORE DELETE ON workouts BEGIN SELECT RAISE(ABORT,'failure'); END").execute(&pool).await.unwrap();
    let delete_path = format!("{workout_path}?baseVersion=2");
    assert_eq!(
        workout_call(
            &state,
            &alice,
            "DELETE",
            &delete_path,
            Some("workout-delete"),
            ""
        )
        .await
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>(
            "SELECT day_type FROM routine_pattern WHERE routine_id='routine'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        "WORKOUT"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT history_revision FROM users WHERE id=?")
            .bind(&owner)
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    sqlx::query("DROP TRIGGER fail_workout_delete")
        .execute(&pool)
        .await
        .unwrap();
    let deleted = workout_call(
        &state,
        &alice,
        "DELETE",
        &delete_path,
        Some("workout-delete"),
        "",
    )
    .await;
    assert_eq!(
        deleted.1["routineVersions"],
        json!([{"id":"routine","version":2}])
    );
    assert_eq!(
        workout_call(
            &state,
            &alice,
            "DELETE",
            &delete_path,
            Some("workout-delete"),
            ""
        )
        .await,
        deleted
    );
    let record: (Option<String>, i64, String) = sqlx::query_as(
        "SELECT workout_id,version,workout_title FROM workout_records WHERE id='record'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(record, (None, 2, "snapshot".into()));
    let snapshot: (Option<String>,Option<String>,i64,i64) = sqlx::query_as("SELECT next_workout_id,next_workout_deadline,version,history_revision FROM streak_snapshots WHERE owner_id=?").bind(&owner).fetch_one(&pool).await.unwrap();
    assert_eq!(snapshot, (None, None, 2, 0));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT history_revision FROM users WHERE id=?")
            .bind(&owner)
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>(
            "SELECT day_type FROM routine_pattern WHERE routine_id='routine'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        "REST"
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
            r#"{"baseVersion":3,"firstName":"After lock"}"#
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
            "/api/user/me?baseVersion=4",
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
        "/api/user/me?baseVersion=4",
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
            "/api/user/me?baseVersion=4",
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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn first_workout_client_sqlite_http_proof() {
    if std::env::var_os("ACTIVE_FIRST_WORKOUT_PROOF").is_none() {
        return;
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let metadata = json!({"issuer":issuer,"jwks_uri":format!("{issuer}/jwks")});
    let jwks = json!({"keys":[{"kty":"RSA","kid":"test","alg":"RS256","use":"sig","n":MODULUS,"e":"AQAB"}]});
    let provider = Router::new()
        .route(
            "/.well-known/openid-configuration",
            get(move || async move { Json(metadata.clone()) }),
        )
        .route("/jwks", get(move || async move { Json(jwks.clone()) }));
    let provider_task = tokio::spawn(async move { axum::serve(listener, provider).await.unwrap() });
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("server.sqlite")).await.unwrap();
    active_api::catalog::seed(&pool).await.unwrap();
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
        body_limit: 1048576,
        request_timeout: Duration::from_secs(30),
        origins: vec![],
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let api_task =
        tokio::spawn(async move { axum::serve(listener, active_api::app(state)).await.unwrap() });
    let source = dir.path().join("source.sqlite");
    let script = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../apps/client/tests/selfHosted/first-workout-proof.cjs"
    );
    for phase in ["prepare", "send", "resume"] {
        let status = std::process::Command::new("node")
            .arg(script)
            .arg(phase)
            .arg(&source)
            .arg(&base)
            .env("ACTIVE_PROOF_TOKEN", token(&issuer, "first-workout-proof"))
            .status()
            .unwrap();
        assert!(status.success(), "client proof phase {phase} failed");
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM workouts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    api_task.abort();
    provider_task.abort();
}
