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
