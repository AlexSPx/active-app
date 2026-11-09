use active_api::{
    db,
    idempotency::{self, Receipt, Request},
};
use axum::http::StatusCode;
use sqlx::SqlitePool;
use tempfile::TempDir;

async fn setup() -> (TempDir, SqlitePool) {
    let dir = TempDir::new().unwrap();
    let pool = db::open(&dir.path().join("db.sqlite")).await.unwrap();
    for owner in ["alice", "bob"] {
        sqlx::query("INSERT INTO users(id,email,username,first_name,last_name,created_at) VALUES(?,?,?,?,?,'2026-01-01T00:00:00Z')")
            .bind(owner).bind(owner).bind(owner).bind(owner).bind(owner).execute(&pool).await.unwrap();
    }
    sqlx::query(
        "CREATE TABLE entities(id TEXT PRIMARY KEY, owner TEXT NOT NULL, UNIQUE(id,owner))",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("CREATE TABLE effects(id INTEGER PRIMARY KEY, entity_id TEXT NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("CREATE TABLE references_owned(entity_id TEXT NOT NULL, owner TEXT NOT NULL, FOREIGN KEY(entity_id,owner) REFERENCES entities(id,owner))").execute(&pool).await.unwrap();
    (dir, pool)
}

fn request<'a>(key: &'a str, method: &'a str, target: &'a str) -> Request<'a> {
    Request {
        owner: "alice",
        key,
        method,
        target,
        canonical_body: b"{}",
    }
}

async fn create(pool: &SqlitePool) -> (StatusCode, Vec<u8>) {
    let req = request("create", "POST", "/entities");
    let mut tx = db::begin_write(pool).await.unwrap();
    if let Some(receipt) = idempotency::claim(&mut tx, &req).await.unwrap() {
        return (receipt.status, receipt.body);
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO entities VALUES(?,?)")
        .bind(&id)
        .bind("alice")
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("INSERT INTO effects(entity_id) VALUES(?)")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .unwrap();
    let receipt = Receipt {
        status: StatusCode::CREATED,
        body: id.into_bytes(),
    };
    idempotency::complete(&mut tx, &req, &receipt)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    (receipt.status, receipt.body)
}

#[tokio::test]
async fn concurrent_create_replays_created_id_once() {
    let (_dir, pool) = setup().await;
    let (first, second) = tokio::join!(create(&pool), create(&pool));
    assert_eq!(first.0, StatusCode::CREATED);
    assert_eq!(first, second);
    let id = String::from_utf8(first.1).unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT id FROM entities")
            .fetch_one(&pool)
            .await
            .unwrap(),
        id
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM effects")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM idempotency_receipts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn delete_replays_after_entity_is_gone() {
    let (_dir, pool) = setup().await;
    create(&pool).await;
    let req = request("delete", "DELETE", "/entities/one");
    let mut tx = db::begin_write(&pool).await.unwrap();
    assert!(idempotency::claim(&mut tx, &req).await.unwrap().is_none());
    assert_eq!(
        sqlx::query("DELETE FROM entities WHERE owner='alice'")
            .execute(&mut *tx)
            .await
            .unwrap()
            .rows_affected(),
        1
    );
    let receipt = Receipt {
        status: StatusCode::NO_CONTENT,
        body: vec![],
    };
    idempotency::complete(&mut tx, &req, &receipt)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let mut retry = db::begin_write(&pool).await.unwrap();
    let replay = idempotency::claim(&mut retry, &req).await.unwrap().unwrap();
    assert_eq!(
        (replay.status, replay.body),
        (StatusCode::NO_CONTENT, vec![])
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM entities")
            .fetch_one(&mut *retry)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn cross_owner_reference_and_post_receipt_failure_roll_back_everything() {
    let (_dir, pool) = setup().await;
    sqlx::query("INSERT INTO entities VALUES('bob-entity','bob')")
        .execute(&pool)
        .await
        .unwrap();
    let req = request("failure", "POST", "/entities");
    for cross_owner in [true, false] {
        let mut tx = db::begin_write(&pool).await.unwrap();
        assert!(idempotency::claim(&mut tx, &req).await.unwrap().is_none());
        sqlx::query("INSERT INTO entities VALUES('new','alice')")
            .execute(&mut *tx)
            .await
            .unwrap();
        sqlx::query("INSERT INTO effects(entity_id) VALUES('new')")
            .execute(&mut *tx)
            .await
            .unwrap();
        if cross_owner {
            assert!(
                sqlx::query("INSERT INTO references_owned VALUES('bob-entity','alice')")
                    .execute(&mut *tx)
                    .await
                    .is_err()
            );
        } else {
            idempotency::complete(
                &mut tx,
                &req,
                &Receipt {
                    status: StatusCode::CREATED,
                    body: b"new".to_vec(),
                },
            )
            .await
            .unwrap();
            assert!(
                sqlx::query("INSERT INTO entities VALUES('new','alice')")
                    .execute(&mut *tx)
                    .await
                    .is_err()
            );
        }
        tx.rollback().await.unwrap();
        for table in ["effects", "references_owned", "idempotency_receipts"] {
            assert_eq!(
                sqlx::query_scalar::<_, i64>(&format!("SELECT count(*) FROM {table}"))
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                0
            );
        }
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM entities WHERE id='new'")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
    }
    assert_eq!(create(&pool).await.0, StatusCode::CREATED);
}
