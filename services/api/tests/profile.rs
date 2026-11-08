use active_api::{
    db,
    profile::{self, VerifiedPrincipal},
    requests::{PutPreferences, UpdateProfile},
};
use tempfile::TempDir;

fn principal(subject: &str) -> VerifiedPrincipal {
    VerifiedPrincipal {
        issuer: "https://issuer.example".into(),
        subject: subject.into(),
        verified_email: Some("user@example.com".into()),
    }
}
fn patch(version: u64, username: &str) -> UpdateProfile {
    serde_json::from_value(serde_json::json!({"baseVersion":version,"username":username})).unwrap()
}

#[tokio::test]
async fn provision_races_versions_and_account_isolation() {
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    let p = principal("alice");
    let (a, b) = tokio::join!(profile::provision(&pool, &p), profile::provision(&pool, &p));
    let alice = a.unwrap();
    assert_eq!(alice, b.unwrap());
    let bob = profile::provision(&pool, &principal("bob")).await.unwrap();
    assert_ne!(alice, bob);
    assert!(uuid::Uuid::parse_str(&alice).is_ok());
    assert_eq!(
        profile::get(&pool, &alice).await.unwrap().profile_version,
        1
    );
    let (a, b) = tokio::join!(
        profile::update(&pool, &alice, patch(1, "alice_1")),
        profile::update(&pool, &alice, patch(1, "alice_2"))
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let winner = profile::get(&pool, &alice).await.unwrap();
    assert_eq!(winner.profile_version, 2);
    assert_eq!(
        profile::update(&pool, &bob, patch(1, &winner.username.to_uppercase()))
            .await
            .unwrap_err()
            .code,
        "USERNAME_TAKEN"
    );
    assert_eq!(profile::get(&pool, &bob).await.unwrap().profile_version, 1);
    assert_eq!(
        profile::get(&pool, "other").await.unwrap_err().code,
        "NOT_FOUND"
    );
    let pref: PutPreferences = serde_json::from_value(
        serde_json::json!({"baseVersion":0,"enabled":true,"timezone":"UTC","schedule":["09:00"]}),
    )
    .unwrap();
    assert_eq!(
        profile::put_preferences(&pool, &alice, pref)
            .await
            .unwrap()
            .version,
        1
    );
    assert_eq!(
        profile::get_preferences(&pool, &bob)
            .await
            .unwrap_err()
            .code,
        "NOT_FOUND"
    );
    assert_eq!(
        profile::delete(&pool, &alice, 1).await.unwrap_err().code,
        "STALE_VERSION"
    );
}

#[tokio::test]
async fn deletion_cascades_and_failure_rolls_back() {
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    let alice = profile::provision(&pool, &principal("alice"))
        .await
        .unwrap();
    let bob = profile::provision(&pool, &principal("bob")).await.unwrap();
    sqlx::query("INSERT INTO sessions VALUES('s', ?, '2026-01-01T00:00:00Z')")
        .bind(&alice)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO idempotency_receipts VALUES(?, 'key', 'PATCH', '/api/user/me', x'00', 200, x'00', '2026-01-01T00:00:00Z')").bind(&alice).execute(&pool).await.unwrap();
    sqlx::query("CREATE TRIGGER prevent_delete AFTER DELETE ON users BEGIN SELECT RAISE(ABORT, 'failure'); END").execute(&pool).await.unwrap();
    assert!(profile::delete(&pool, &alice, 1).await.is_err());
    assert!(profile::get(&pool, &alice).await.is_ok());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    sqlx::query("DROP TRIGGER prevent_delete")
        .execute(&pool)
        .await
        .unwrap();
    profile::delete(&pool, &alice, 1).await.unwrap();
    for table in ["sessions", "idempotency_receipts"] {
        assert_eq!(
            sqlx::query_scalar::<_, i64>(&format!("SELECT count(*) FROM {table}"))
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
    }
    assert!(profile::get(&pool, &bob).await.is_ok());
}

fn update(value: serde_json::Value) -> UpdateProfile {
    serde_json::from_value(value).unwrap()
}
fn preferences(value: serde_json::Value) -> PutPreferences {
    serde_json::from_value(value).unwrap()
}

#[tokio::test]
async fn provisioning_requires_email_only_for_new_issuer_subject() {
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    for email in [None, Some("invalid".into()), Some("".into())] {
        let mut p = principal("missing");
        p.verified_email = email;
        assert_eq!(
            profile::provision(&pool, &p).await.unwrap_err().code,
            "FORBIDDEN"
        );
    }
    for table in ["users", "identities"] {
        assert_eq!(
            sqlx::query_scalar::<_, i64>(&format!("SELECT count(*) FROM {table}"))
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
    }
    let mut p = principal("same");
    let first = profile::provision(&pool, &p).await.unwrap();
    p.verified_email = None;
    assert_eq!(profile::provision(&pool, &p).await.unwrap(), first);
    p.issuer = "https://other.example".into();
    assert_eq!(
        profile::provision(&pool, &p).await.unwrap_err().code,
        "FORBIDDEN"
    );
    p.verified_email = Some("other@example.com".into());
    assert_ne!(profile::provision(&pool, &p).await.unwrap(), first);
}

#[tokio::test]
async fn profile_and_preferences_versions_and_validation() {
    use serde_json::json;
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    let id = profile::provision(&pool, &principal("versions"))
        .await
        .unwrap();
    let initial = serde_json::to_value(profile::get(&pool, &id).await.unwrap()).unwrap();
    assert_eq!(
        serde_json::to_value(
            profile::update(&pool, &id, update(json!({"baseVersion":1})))
                .await
                .unwrap()
        )
        .unwrap(),
        initial
    );
    let changed = profile::update(
        &pool,
        &id,
        update(
            json!({"baseVersion":1,"timezone":"UTC","measurements":{"weightKg":70,"heightCm":180}}),
        ),
    )
    .await
    .unwrap();
    assert_eq!(changed.profile_version, 2);
    let replaced = profile::update(
        &pool,
        &id,
        update(json!({"baseVersion":2,"measurements":{"weightKg":null,"heightCm":170}})),
    )
    .await
    .unwrap();
    assert_eq!(
        serde_json::to_value(&replaced).unwrap()["measurements"],
        json!({"weightKg":null,"heightCm":170.0})
    );
    let cleared = profile::update(
        &pool,
        &id,
        update(json!({"baseVersion":3,"timezone":null,"measurements":null})),
    )
    .await
    .unwrap();
    assert_eq!(cleared.profile_version, 4);
    assert!(cleared.timezone.is_none() && cleared.measurements.is_none());
    let before = serde_json::to_value(&cleared).unwrap();
    for invalid in [
        json!({"baseVersion":4,"username":"!"}),
        json!({"baseVersion":4,"email":"bad"}),
        json!({"baseVersion":4,"timezone":"bad"}),
        json!({"baseVersion":4,"measurements":{"weightKg":-1,"heightCm":null}}),
    ] {
        assert!(profile::update(&pool, &id, update(invalid)).await.is_err());
    }
    assert_eq!(
        profile::update(&pool, &id, update(json!({"baseVersion":3})))
            .await
            .unwrap_err()
            .code,
        "STALE_VERSION"
    );
    assert_eq!(
        serde_json::to_value(profile::get(&pool, &id).await.unwrap()).unwrap(),
        before
    );
    let input =
        json!({"baseVersion":0,"enabled":true,"timezone":"UTC","schedule":["09:00","18:30"]});
    let (a, b) = tokio::join!(
        profile::put_preferences(&pool, &id, preferences(input.clone())),
        profile::put_preferences(&pool, &id, preferences(input))
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let current = profile::get_preferences(&pool, &id).await.unwrap();
    let before = serde_json::to_value(&current).unwrap();
    assert_eq!(current.version, 1);
    let noop =
        json!({"baseVersion":1,"enabled":true,"timezone":"UTC","schedule":["09:00","18:30"]});
    assert_eq!(
        serde_json::to_value(
            profile::put_preferences(&pool, &id, preferences(noop))
                .await
                .unwrap()
        )
        .unwrap(),
        before
    );
    for invalid in [
        json!({"baseVersion":1,"enabled":true,"timezone":"UTC","schedule":["09:00","09:00"]}),
        json!({"baseVersion":1,"enabled":true,"timezone":"bad","schedule":[]}),
        json!({"baseVersion":1,"enabled":true,"timezone":"UTC","schedule":["24:00"]}),
    ] {
        assert!(
            profile::put_preferences(&pool, &id, preferences(invalid))
                .await
                .is_err()
        );
    }
    assert_eq!(
        profile::put_preferences(
            &pool,
            &id,
            preferences(json!({"baseVersion":0,"enabled":false,"timezone":"UTC","schedule":[]}))
        )
        .await
        .unwrap_err()
        .code,
        "STALE_VERSION"
    );
    assert_eq!(
        serde_json::to_value(profile::get_preferences(&pool, &id).await.unwrap()).unwrap(),
        before
    );
}

async fn seed_graph(pool: &sqlx::SqlitePool, owner: &str, key: &str) {
    let sql = format!(
        r#"
INSERT INTO workouts(id,owner_id,title,created_at) VALUES('{key}-w','{owner}','Workout','2026-01-01T00:00:00Z');
INSERT INTO workout_exercises(owner_id,workout_id,position,exercise_id) VALUES('{owner}','{key}-w',0,'catalog');
INSERT INTO workout_sets VALUES('{key}-w',0,0,'WEIGHT',5,20,NULL);
INSERT INTO routines(id,owner_id,name,routine_type,start_date,created_at) VALUES('{key}-r','{owner}','Routine','SEQUENTIAL','2026-01-01','2026-01-01T00:00:00Z');
INSERT INTO active_routines VALUES('{owner}','{key}-r');
INSERT INTO routine_pattern VALUES('{owner}','{key}-r',0,'WORKOUT','{key}-w');
INSERT INTO client_record_ids VALUES('{owner}','{key}-client'),('{owner}','{key}-tombstone');
INSERT INTO workout_records(id,owner_id,client_record_id,workout_id,workout_title,start_time,completed_at,completion_timezone,created_at) VALUES('{key}-record','{owner}','{key}-client','{key}-w','Workout','2026-01-01T00:00:00Z','2026-01-01T01:00:00Z','UTC','2026-01-01T01:00:00Z');
INSERT INTO record_exercises(record_id,position,exercise_id,exercise_name,dataset_version,source_key) VALUES('{key}-record',0,'catalog','Exercise','v1','source');
INSERT INTO record_sets VALUES('{key}-record',0,0,'WEIGHT',5,20,NULL);
INSERT INTO personal_bests VALUES('{key}-record',0,25,100);
INSERT INTO streak_snapshots(owner_id,version,history_revision,rules_version,current_streak,longest_streak,next_workout_id,streak_freeze_count) VALUES('{owner}',1,1,'v1',1,1,'{key}-w',0);
INSERT INTO streak_weekly_workouts VALUES('{owner}',0,'{key}-w');
INSERT INTO reminder_preferences VALUES('{owner}',1,'UTC',1);
INSERT INTO reminder_times VALUES('{owner}',0,'09:00'),('{owner}',1,'18:00');
INSERT INTO sessions VALUES('{key}-session','{owner}','2026-01-01T00:00:00Z');
INSERT INTO idempotency_receipts VALUES('{owner}','key','PATCH','/api/user/me',x'00',200,x'00','2026-01-01T00:00:00Z');
"#
    );
    sqlx::raw_sql(&sql).execute(pool).await.unwrap();
}

async fn graph_counts(pool: &sqlx::SqlitePool) -> Vec<i64> {
    let mut counts = Vec::new();
    for table in [
        "users",
        "identities",
        "sessions",
        "workouts",
        "workout_exercises",
        "workout_sets",
        "routines",
        "active_routines",
        "routine_pattern",
        "client_record_ids",
        "workout_records",
        "record_exercises",
        "record_sets",
        "personal_bests",
        "streak_snapshots",
        "streak_weekly_workouts",
        "reminder_preferences",
        "reminder_times",
        "idempotency_receipts",
        "exercises",
        "exercise_legacy_keys",
        "exercise_muscles",
        "exercise_instructions",
    ] {
        counts.push(
            sqlx::query_scalar::<_, i64>(&format!("SELECT count(*) FROM {table}"))
                .fetch_one(pool)
                .await
                .unwrap(),
        );
    }
    counts
}

#[tokio::test]
async fn linked_owner_graph_deletion_and_rollback() {
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    let alice = profile::provision(&pool, &principal("graph-alice"))
        .await
        .unwrap();
    let bob = profile::provision(&pool, &principal("graph-bob"))
        .await
        .unwrap();
    sqlx::raw_sql("INSERT INTO exercises(id,dataset_version,source_key,name) VALUES('catalog','v1','source','Exercise'); INSERT INTO exercise_legacy_keys VALUES('old','1','catalog'); INSERT INTO exercise_muscles VALUES('catalog','PRIMARY',0,'muscle'); INSERT INTO exercise_instructions VALUES('catalog',0,'instruction');").execute(&pool).await.unwrap();
    seed_graph(&pool, &alice, "a").await;
    seed_graph(&pool, &bob, "b").await;
    let before = graph_counts(&pool).await;
    sqlx::query("CREATE TRIGGER fail_delete AFTER DELETE ON users BEGIN SELECT RAISE(ABORT, 'injected'); END").execute(&pool).await.unwrap();
    assert!(profile::delete(&pool, &alice, 1).await.is_err());
    assert_eq!(graph_counts(&pool).await, before);
    assert_eq!(
        profile::provision(&pool, &principal("graph-alice"))
            .await
            .unwrap(),
        alice
    );
    sqlx::query("DROP TRIGGER fail_delete")
        .execute(&pool)
        .await
        .unwrap();
    profile::delete(&pool, &alice, 1).await.unwrap();
    let after = graph_counts(&pool).await;
    for (i, count) in after.iter().enumerate() {
        assert_eq!(
            *count,
            if i >= 19 { before[i] } else { before[i] / 2 },
            "table index {i}"
        );
    }
    assert!(profile::get(&pool, &alice).await.is_err());
    assert_eq!(
        profile::get(&pool, &bob)
            .await
            .unwrap()
            .active_routine_id
            .as_deref(),
        Some("b-r")
    );
    assert_eq!(
        profile::get_preferences(&pool, &bob)
            .await
            .unwrap()
            .schedule,
        ["09:00", "18:00"]
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM pragma_foreign_key_check")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn production_routes_reject_untrusted_identity_headers() {
    use active_api::{AppState, app};
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use std::{
        sync::{Arc, atomic::AtomicBool},
        time::Duration,
    };
    use tokio::sync::RwLock;
    use tower::ServiceExt;
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    let id = profile::provision(&pool, &principal("route"))
        .await
        .unwrap();
    let state = AppState {
        auth: Default::default(),
        pool: pool.clone(),
        discovery: Arc::new(RwLock::new(None)),
        draining: Arc::new(AtomicBool::new(false)),
        body_limit: 4096,
        request_timeout: Duration::from_secs(5),
        origins: vec![],
    };
    for (method, path) in [
        ("GET", "/api/user/me"),
        ("PATCH", "/api/user/me"),
        ("DELETE", "/api/user/me?baseVersion=1"),
        ("GET", "/api/reminder-preferences"),
        ("PUT", "/api/reminder-preferences"),
    ] {
        for headers in [false, true] {
            let mut request = Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .header("x-active-contract-version", "1");
            if headers {
                request = request
                    .header("x-user-id", &id)
                    .header("x-forwarded-user", &id)
                    .header("x-auth-request-user", &id)
                    .header("authorization", "Bearer forged");
            }
            let response = app(state.clone())
                .oneshot(request.body(Body::from("{}")).unwrap())
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                if headers {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::UNAUTHORIZED
                },
                "{method} {path}"
            );
        }
    }
    assert_eq!(profile::get(&pool, &id).await.unwrap().profile_version, 1);
    assert!(profile::get_preferences(&pool, &id).await.is_err());
}

#[tokio::test]
async fn deleted_identity_cannot_be_provisioned_again() {
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    let p = principal("deleted");
    let owner = profile::provision(&pool, &p).await.unwrap();
    profile::delete(&pool, &owner, 1).await.unwrap();
    assert_eq!(
        profile::provision(&pool, &p).await.unwrap_err().code,
        "FORBIDDEN"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
}
