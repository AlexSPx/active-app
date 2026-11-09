use std::{path::Path, time::Duration};

use sqlx::{
    Sqlite, SqlitePool, Transaction,
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// Opens a local on-disk database and applies all pending migrations before returning it.
pub async fn open(path: &Path) -> Result<SqlitePool, Box<dyn std::error::Error + Send + Sync>> {
    if !path.is_absolute() {
        return Err("database path must be absolute and outside the source/build tree".into());
    }
    let parent = path
        .parent()
        .ok_or("database path has no parent")?
        .canonicalize()?;
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let source = source.canonicalize().unwrap_or(source);
    if parent.starts_with(&source) {
        return Err("database path must be outside the source/build tree".into());
    }
    let filename = parent.join(path.file_name().ok_or("database path has no filename")?);
    if filename.symlink_metadata().is_ok() && filename.canonicalize()?.starts_with(&source) {
        return Err("database path must be outside the source/build tree".into());
    }
    let options = SqliteConnectOptions::new()
        .filename(filename)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .busy_timeout(Duration::from_millis(500));
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
    if let Err(error) = MIGRATOR.run(&pool).await {
        pool.close().await;
        return Err(error.into());
    }
    Ok(pool)
}

/// Acquires the writer lock before reading state for a conditional mutation.
/// Lock acquisition is retried at most three times. Never hold this transaction across network calls.
pub async fn begin_write(pool: &SqlitePool) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
    for attempt in 0..3 {
        match pool.begin_with("BEGIN IMMEDIATE").await {
            Err(sqlx::Error::Database(error))
                if matches!(error.code().as_deref(), Some("5" | "6")) && attempt < 2 =>
            {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            result => return result,
        }
    }
    unreachable!()
}

/// Translate writer lock exhaustion into a retryable response.
pub fn write_error(error: sqlx::Error) -> crate::boundary::ApiError {
    if matches!(&error, sqlx::Error::Database(e) if matches!(e.code().as_deref(), Some("5" | "6")))
    {
        crate::boundary::ApiError::new(
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_BUSY",
            "Database temporarily busy",
        )
    } else {
        crate::boundary::ApiError::new(
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "Internal error",
        )
    }
}
