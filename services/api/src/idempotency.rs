//! Receipt operations must run inside a transaction opened with `db::begin_write`.
use axum::http::StatusCode;
use sqlx::{Row, Sqlite, Transaction};

use crate::{boundary::ApiError, profile};

pub struct Request<'a> {
    pub owner: &'a str,
    pub key: &'a str,
    pub method: &'a str,
    pub target: &'a str,
    pub canonical_body: &'a [u8],
}

pub struct Receipt {
    pub status: StatusCode,
    pub body: Vec<u8>,
}

fn internal(_: sqlx::Error) -> ApiError {
    ApiError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Internal error",
    )
}

/// The SQLite writer lock is the claim: no other writer can check this key until
/// this transaction commits or rolls back. A failed operation leaves no receipt.
pub async fn claim(
    tx: &mut Transaction<'_, Sqlite>,
    request: &Request<'_>,
) -> Result<Option<Receipt>, ApiError> {
    let row = sqlx::query("SELECT method,target,body_hash,response_status,response_body FROM idempotency_receipts WHERE owner_id=? AND operation_key=?")
        .bind(request.owner).bind(request.key).fetch_optional(&mut **tx).await.map_err(internal)?;
    let Some(row) = row else { return Ok(None) };
    if row.get::<String, _>(0) != request.method
        || row.get::<String, _>(1) != request.target
        || row.get::<Vec<u8>, _>(2) != profile::sha256(request.canonical_body)
    {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "IDEMPOTENCY_KEY_REUSED",
            "Idempotency key reused",
        ));
    }
    let status = StatusCode::from_u16(row.get::<i64, _>(3) as u16).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "Internal error",
        )
    })?;
    Ok(Some(Receipt {
        status,
        body: row.get(4),
    }))
}

/// Complete only after all domain writes and side effects have succeeded, before commit.
pub async fn complete(
    tx: &mut Transaction<'_, Sqlite>,
    request: &Request<'_>,
    receipt: &Receipt,
) -> Result<(), ApiError> {
    sqlx::query("INSERT INTO idempotency_receipts(owner_id,operation_key,method,target,body_hash,response_status,response_body,completed_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(request.owner).bind(request.key).bind(request.method).bind(request.target)
        .bind(profile::sha256(request.canonical_body).as_slice()).bind(i64::from(receipt.status.as_u16())).bind(&receipt.body)
        .bind(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .execute(&mut **tx).await.map_err(internal)?;
    Ok(())
}
