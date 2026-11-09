use std::{path::Path, time::Duration};

use active_api::db;
use sqlx::{Executor, Row, SqlitePool, migrate::Migrator};
use tempfile::TempDir;

async fn database(dir: &TempDir) -> SqlitePool {
    db::open(&dir.path().join("active.sqlite3")).await.unwrap()
}

async fn user(pool: &SqlitePool, id: &str) {
    sqlx::query("INSERT INTO users(id,email,username,first_name,last_name,created_at) VALUES(?, ?, ?, 'First', 'Last', '2026-01-01T00:00:00Z')")
        .bind(id).bind(format!("{id}@example.test")).bind(id).execute(pool).await.unwrap();
}

#[tokio::test]
async fn migrations_pragmas_restart_and_integrity() {
    let dir = TempDir::new().unwrap();
    let pool = database(&dir).await;
    let mut connections = Vec::new();
    for _ in 0..4 {
        let mut connection = pool.acquire().await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("PRAGMA foreign_keys")
                .fetch_one(&mut *connection)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("PRAGMA synchronous")
                .fetch_one(&mut *connection)
                .await
                .unwrap(),
            2
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("PRAGMA journal_mode")
                .fetch_one(&mut *connection)
                .await
                .unwrap(),
            "wal"
        );
        connections.push(connection);
    }
    drop(connections);
    sqlx::query("INSERT INTO instance_metadata VALUES(1, 'instance-1')")
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;
    let pool = database(&dir).await;
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT instance_id FROM instance_metadata")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "instance-1"
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "ok"
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT sqlite_version()")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "3.46.0"
    );
}

#[tokio::test]
async fn constraints_enforce_ownership_order_nulls_and_tombstones() {
    let dir = TempDir::new().unwrap();
    let pool = database(&dir).await;
    user(&pool, "alice").await;
    user(&pool, "bob").await;
    sqlx::query("INSERT INTO workouts(id,owner_id,title,created_at) VALUES('w','alice','Title','2026-01-01T00:00:00Z')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO routines(id,owner_id,name,routine_type,start_date,created_at) VALUES('r','bob','Routine','SEQUENTIAL','2026-01-01','2026-01-01T00:00:00Z')").execute(&pool).await.unwrap();
    assert!(
        sqlx::query("INSERT INTO routine_pattern VALUES('bob','r',0,'WORKOUT','w')")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("INSERT INTO routine_pattern VALUES('bob','r',0,'REST','w')")
            .execute(&pool)
            .await
            .is_err()
    );
    sqlx::query("INSERT INTO routine_pattern VALUES('bob','r',0,'REST',NULL)")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        sqlx::query("INSERT INTO routine_pattern VALUES('bob','r',0,'REST',NULL)")
            .execute(&pool)
            .await
            .is_err()
    );
    sqlx::query("INSERT INTO client_record_ids VALUES('alice','client-1')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO workout_records VALUES('record','alice','client-1',NULL,'Old title',NULL,'2026-01-01T00:00:00Z','2026-01-01T01:00:00Z','UTC',1,'2026-01-01T01:00:00Z')").execute(&pool).await.unwrap();
    sqlx::query("DELETE FROM workout_records WHERE id='record'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        sqlx::query("INSERT INTO client_record_ids VALUES('alice','client-1')")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("INSERT INTO identities VALUES('issuer','subject','missing')")
            .execute(&pool)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn immediate_writers_serialize_version_checks_and_receipts() {
    let dir = TempDir::new().unwrap();
    let pool = database(&dir).await;
    user(&pool, "alice").await;
    let mut first = db::begin_write(&pool).await.unwrap();
    let second_pool = pool.clone();
    let second = tokio::spawn(async move {
        let mut tx = db::begin_write(&second_pool).await.unwrap();
        let version: i64 = sqlx::query_scalar("SELECT version FROM users WHERE id='alice'")
            .fetch_one(&mut *tx)
            .await
            .unwrap();
        let stale_rows =
            sqlx::query("UPDATE users SET version=version+1 WHERE id='alice' AND version=1")
                .execute(&mut *tx)
                .await
                .unwrap()
                .rows_affected();
        let duplicate = sqlx::query("INSERT INTO idempotency_receipts VALUES('alice','key','POST','/x',x'01',200,x'7b7d','2026-01-01T00:00:00Z')").execute(&mut *tx).await.is_err();
        tx.rollback().await.unwrap();
        (version, stale_rows, duplicate)
    });
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(!second.is_finished());
    sqlx::query("UPDATE users SET version=version+1 WHERE id='alice' AND version=1")
        .execute(&mut *first)
        .await
        .unwrap();
    sqlx::query("INSERT INTO idempotency_receipts VALUES('alice','key','POST','/x',x'01',200,x'7b7d','2026-01-01T00:00:00Z')").execute(&mut *first).await.unwrap();
    first.commit().await.unwrap();
    assert_eq!(second.await.unwrap(), (2, 0, true));
    let mut rolled_back = db::begin_write(&pool).await.unwrap();
    sqlx::query("UPDATE users SET version=99 WHERE id='alice'")
        .execute(&mut *rolled_back)
        .await
        .unwrap();
    rolled_back.rollback().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT version FROM users WHERE id='alice'")
            .fetch_one(&pool)
            .await
            .unwrap(),
        2
    );
}

#[tokio::test]
async fn contention_is_bounded_and_failed_migration_is_atomic() {
    let dir = TempDir::new().unwrap();
    let pool = database(&dir).await;
    let lock = db::begin_write(&pool).await.unwrap();
    let start = tokio::time::Instant::now();
    assert!(db::begin_write(&pool).await.is_err());
    assert!(start.elapsed() < Duration::from_secs(4));
    lock.rollback().await.unwrap();
    let migrations = dir.path().join("migrations");
    std::fs::create_dir(&migrations).unwrap();
    let next: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version),0)+1 FROM _sqlx_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    std::fs::write(
        migrations.join(format!("{next:04}_bad.sql")),
        "CREATE TABLE partial (id INTEGER); INSERT INTO missing_table VALUES (1);",
    )
    .unwrap();
    let migrator = Migrator::new(Path::new(&migrations)).await.unwrap();
    // Ignore existing migrations while exercising the next failing forward migration.
    let mut migrator = migrator;
    migrator.set_ignore_missing(true);
    assert!(migrator.run(&pool).await.is_err());
    let row = sqlx::query(
        "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='partial'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.get::<i64, _>("n"), 0);
    let mut conn = pool.acquire().await.unwrap();
    assert!(conn.execute("SELECT * FROM partial").await.is_err());
}

#[tokio::test]
async fn forward_migration_is_repeatable_and_preserves_data() {
    let dir = TempDir::new().unwrap();
    let pool = database(&dir).await;
    user(&pool, "alice").await;
    let migrations = dir.path().join("upgrade");
    std::fs::create_dir(&migrations).unwrap();
    let next: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version),0)+1 FROM _sqlx_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    std::fs::write(migrations.join(format!("{next:04}_upgrade.sql")), "CREATE TABLE upgrade_example (id INTEGER PRIMARY KEY); INSERT INTO upgrade_example VALUES(7);").unwrap();
    let mut migrator = Migrator::new(migrations.as_path()).await.unwrap();
    migrator.set_ignore_missing(true);
    migrator.run(&pool).await.unwrap();
    migrator.run(&pool).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM upgrade_example")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id='alice'")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "alice"
    );
}

#[tokio::test]
async fn refuses_relative_and_source_tree_paths() {
    assert!(db::open(Path::new("active.sqlite")).await.is_err());
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("data.sqlite");
    assert!(db::open(&path).await.is_err());
    assert!(!path.exists());
}

#[tokio::test]
async fn chronological_indexes_preserve_fractional_precision_and_ties() {
    let dir = TempDir::new().unwrap();
    let pool = database(&dir).await;
    user(&pool, "alice").await;
    for (id, instant) in [
        ("d", "2026-11-01T12:00:00.1000000000000000001Z"),
        ("c", "2026-11-01T12:00:00.1Z"),
        ("b", "2026-11-01T12:00:00.000Z"),
        ("a", "2026-11-01T12:00:00Z"),
        ("e", "2026-11-01T12:00:01Z"),
    ] {
        sqlx::query("INSERT INTO client_record_ids VALUES('alice', ?)")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workout_records VALUES(?, 'alice', ?, NULL, 'Title', NULL, ?, ?, 'UTC', 1, ?)")
            .bind(id).bind(id).bind(instant).bind(instant).bind(instant)
            .execute(&pool).await.unwrap();
    }
    let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM workout_records INDEXED BY records_chronology WHERE owner_id='alice' ORDER BY unixepoch(substr(completed_at, 1, 19) || 'Z'), CASE WHEN length(completed_at) > 20 THEN rtrim(substr(completed_at, 21, length(completed_at) - 21), '0') ELSE '' END, id")
        .fetch_all(&pool).await.unwrap();
    assert_eq!(ids, ["a", "b", "c", "d", "e"]);
    for invalid in [
        "2026-11-01T12:00:00.Z",
        "2026-11-01T12:00:00+00:00",
        "2026-11-01T12:00:00.xZ",
    ] {
        assert!(
            sqlx::query("UPDATE workout_records SET completed_at=? WHERE id='a'")
                .bind(invalid)
                .execute(&pool)
                .await
                .is_err()
        );
    }
}
