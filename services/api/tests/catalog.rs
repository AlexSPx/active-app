use active_api::{catalog, db};
use serde_json::Value;

#[tokio::test]
async fn import_is_atomic_repeatable_and_preserves_retired_identities() {
    let dir = tempfile::tempdir().unwrap();
    let pool = db::open(&dir.path().join("catalog.db")).await.unwrap();
    catalog::seed(&pool).await.unwrap();
    let first = catalog::snapshot(&pool).await.unwrap();
    let items = first["items"].as_array().unwrap();
    assert_eq!(items.len(), 876);
    assert_eq!(first["mappingComplete"], true);
    let first_id = items[0]["id"].clone();
    let source_key = items[0]["sourceKey"].clone();
    catalog::seed(&pool).await.unwrap();
    assert_eq!(catalog::snapshot(&pool).await.unwrap(), first);
    catalog::import(
        &pool,
        include_str!("../../../apps/client/lib/data/exercise-catalog.json"),
        "new-dataset-revision",
    )
    .await
    .unwrap();
    let upgraded = catalog::snapshot(&pool).await.unwrap();
    assert_eq!(upgraded["items"][0]["id"], first_id);
    assert!(
        upgraded["sourceMappings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|mapping| {
                mapping["datasetVersion"] == catalog::DATASET_VERSION
                    && mapping["sourceKey"] == source_key
                    && mapping["exerciseId"] == first_id
            })
    );
    if let Ok(path) = std::env::var("ACTIVE_CATALOG_UPGRADE_FIXTURE") {
        std::fs::write(path, serde_json::to_vec(&upgraded).unwrap()).unwrap();
    }
    catalog::seed(&pool).await.unwrap();
    let mut dataset: Vec<Value> = serde_json::from_str(include_str!(
        "../../../apps/client/lib/data/exercise-catalog.json"
    ))
    .unwrap();
    dataset.retain(|item| item["sourceKey"] != source_key);
    catalog::import(
        &pool,
        &serde_json::to_string(&dataset).unwrap(),
        catalog::DATASET_VERSION,
    )
    .await
    .unwrap();
    let retired = catalog::snapshot(&pool).await.unwrap();
    let item = retired["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["sourceKey"] == source_key)
        .unwrap();
    assert_eq!(item["id"], first_id);
    assert_eq!(item["retired"], true);
    assert!(
        catalog::import(&pool, "[{}]", catalog::DATASET_VERSION)
            .await
            .is_err()
    );
    assert_eq!(catalog::snapshot(&pool).await.unwrap(), retired);
    catalog::seed(&pool).await.unwrap();
    let restored = catalog::snapshot(&pool).await.unwrap();
    let item = restored["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["sourceKey"] == source_key)
        .unwrap();
    assert_eq!(item["id"], first_id);
    assert_eq!(item["retired"], false);
}

#[tokio::test]
async fn authenticated_catalog_search_and_mapping_failures() {
    use active_api::{AppState, auth::AuthState, web_auth::WebConfig};
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode},
    };
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use sha2::{Digest, Sha256};
    use std::{
        sync::{Arc, atomic::AtomicBool},
        time::Duration,
    };
    use tokio::sync::RwLock;
    use tower::ServiceExt;

    let dir = tempfile::tempdir().unwrap();
    let pool = db::open(&dir.path().join("api.db")).await.unwrap();
    catalog::seed(&pool).await.unwrap();
    sqlx::query("INSERT INTO users(id,email,username,first_name,last_name,created_at) VALUES('u','a@example.com','user','A','B','2026-01-01T00:00:00Z')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO identities VALUES('issuer','subject','u')")
        .execute(&pool)
        .await
        .unwrap();
    let cookie = "a".repeat(43);
    let hash = URL_SAFE_NO_PAD.encode(Sha256::digest(cookie.as_bytes()));
    sqlx::query("INSERT INTO sessions VALUES(?,'u','2099-01-01T00:00:00Z')")
        .bind(&hash)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO web_session_metadata VALUES(?,'csrf','issuer','subject')")
        .bind(&hash)
        .execute(&pool)
        .await
        .unwrap();
    let mut auth = AuthState::default();
    auth.set_web_config(Some(WebConfig {
        client_id: "client".into(),
        client_secret: "secret".into(),
        external_url: url::Url::parse("http://localhost").unwrap(),
    }));
    let state = AppState {
        pool: pool.clone(),
        auth,
        discovery: Arc::new(RwLock::new(None)),
        draining: Arc::new(AtomicBool::new(false)),
        body_limit: 1048576,
        request_timeout: Duration::from_secs(30),
        origins: vec![],
    };
    let call = |path: &'static str, authenticated: bool| {
        let state = state.clone();
        let cookie = cookie.clone();
        async move {
            let mut request = Request::builder().uri(path);
            if authenticated {
                request = request.header("cookie", format!("active_session={cookie}"));
            }
            let response = catalog::routes()
                .with_state(state)
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            let status = response.status();
            let body = to_bytes(response.into_body(), 2_000_000).await.unwrap();
            (status, serde_json::from_slice::<Value>(&body).unwrap())
        }
    };
    let ready = |state: AppState| async move {
        let response = active_api::app(state)
            .oneshot(
                Request::builder()
                    .uri("/ready")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        serde_json::from_slice::<Value>(&to_bytes(response.into_body(), 4096).await.unwrap())
            .unwrap()
    };
    assert_eq!(
        call("/api/exercises/catalog", false).await.0,
        StatusCode::UNAUTHORIZED
    );
    let (status, snapshot) = call("/api/exercises/catalog", true).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(snapshot, catalog::snapshot(&pool).await.unwrap());
    assert_eq!(ready(state.clone()).await["catalog"], true);
    let items = snapshot["items"].as_array().unwrap();
    assert_eq!(items.len(), 876);
    assert!(
        items
            .windows(2)
            .all(|pair| pair[0]["sourceKey"].as_str() < pair[1]["sourceKey"].as_str())
    );
    let bundled: Vec<Value> = serde_json::from_str(include_str!(
        "../../../apps/client/lib/data/exercise-catalog.json"
    ))
    .unwrap();
    for source in &bundled {
        let item = items
            .iter()
            .find(|item| item["sourceKey"] == source["sourceKey"])
            .unwrap();
        for field in [
            "name",
            "level",
            "force",
            "mechanic",
            "equipment",
            "category",
            "primaryMuscles",
            "secondaryMuscles",
            "instructions",
        ] {
            assert_eq!(
                item[field], source[field],
                "{}: {field}",
                source["sourceKey"]
            );
        }
        assert!(snapshot["sourceMappings"].as_array().unwrap().iter().any(
            |mapping| mapping["datasetVersion"] == catalog::DATASET_VERSION
                && mapping["sourceKey"] == source["sourceKey"]
                && mapping["exerciseId"] == item["id"]
        ));
    }
    let (status, search) = call("/api/exercises/search?name=SquAt", true).await;
    assert_eq!(status, StatusCode::OK);
    let expected: Vec<_> = items
        .iter()
        .filter(|item| {
            item["name"]
                .as_str()
                .unwrap()
                .to_lowercase()
                .contains("squat")
        })
        .cloned()
        .collect();
    assert_eq!(search, serde_json::json!(expected));
    assert_eq!(
        call("/api/exercises/search?name=", true).await.0,
        StatusCode::BAD_REQUEST
    );
    let key = items[0]["sourceKey"].as_str().unwrap();
    sqlx::query("DELETE FROM exercise_source_keys WHERE source_key=?")
        .bind(key)
        .execute(&pool)
        .await
        .unwrap();
    let (_, incomplete) = call("/api/exercises/catalog", true).await;
    assert_eq!(incomplete["mappingComplete"], false);
    assert_eq!(incomplete["unresolvedSourceKeys"], serde_json::json!([key]));
    catalog::seed(&pool).await.unwrap();
    assert_eq!(catalog::snapshot(&pool).await.unwrap(), snapshot);
    sqlx::query("INSERT INTO exercise_source_keys VALUES('conflicting-revision',?,?)")
        .bind(key)
        .bind(items[1]["id"].as_str().unwrap())
        .execute(&pool)
        .await
        .unwrap();
    let (_, ambiguous) = call("/api/exercises/catalog", true).await;
    assert_eq!(ambiguous["mappingComplete"], false);
    assert_eq!(ambiguous["unresolvedSourceKeys"], serde_json::json!([key]));
    assert_eq!(ready(state.clone()).await["catalog"], false);
    assert!(catalog::seed(&pool).await.is_err());
    assert_eq!(catalog::snapshot(&pool).await.unwrap(), ambiguous);
}
