use crate::{
    AppState, auth,
    boundary::{ApiError, Validate},
    db, idempotency, profile,
    requests::{PutPreferences, UpdateProfile, VersionQuery},
};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
};
use serde::de::DeserializeOwned;
use sqlx::Row;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/user/me", any(handle))
        .route("/api/reminder-preferences", any(handle))
}
fn internal() -> ApiError {
    ApiError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Internal error",
    )
}
fn reused() -> ApiError {
    ApiError::new(
        StatusCode::CONFLICT,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency key reused",
    )
}
fn parse<T: DeserializeOwned + Validate>(bytes: &[u8]) -> Result<T, ApiError> {
    let value: T = serde_json::from_slice(bytes).map_err(|_| ApiError::validation("body"))?;
    value.validate()?;
    Ok(value)
}
fn key(headers: &HeaderMap) -> Result<String, ApiError> {
    let values = headers.get_all("idempotency-key");
    if values.iter().count() != 1 {
        return Err(ApiError::validation("idempotencyKey"));
    }
    let value = values
        .iter()
        .next()
        .unwrap()
        .to_str()
        .map_err(|_| ApiError::validation("idempotencyKey"))?;
    if value.trim().is_empty() || value.len() > 256 {
        return Err(ApiError::validation("idempotencyKey"));
    }
    Ok(value.to_owned())
}
async fn handle(State(state): State<AppState>, req: Request) -> Result<Response, ApiError> {
    let (parts, body) = req.into_parts();
    let method = parts.method.as_str();
    let path = parts.uri.path();
    let mutation = method != "GET";
    let authentication = match auth::authenticate(&state, &parts.headers, mutation).await {
        Err(error) if method != "DELETE" || parts.headers.contains_key("authorization") => {
            return Err(error);
        }
        Err(error) if crate::web_auth::session_cookie(&state, &parts.headers)?.is_none() => {
            return Err(error);
        }
        other => other,
    };
    if !matches!(
        (method, path),
        ("GET" | "PATCH" | "DELETE", "/api/user/me") | ("GET" | "PUT", "/api/reminder-preferences")
    ) {
        return Err(ApiError::new(
            StatusCode::METHOD_NOT_ALLOWED,
            "METHOD_NOT_ALLOWED",
            "Method not allowed",
        ));
    }
    let bytes = to_bytes(body, state.body_limit)
        .await
        .map_err(|_| ApiError::validation("body"))?;
    let version = if method == "DELETE" {
        let query = parts
            .uri
            .query()
            .ok_or_else(|| ApiError::validation("query"))?;
        let pairs: Vec<_> = url::form_urlencoded::parse(query.as_bytes()).collect();
        if pairs.len() != 1
            || pairs[0].0 != "baseVersion"
            || pairs[0].1.is_empty()
            || !pairs[0].1.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(ApiError::validation("query"));
        }
        let base_version = pairs[0]
            .1
            .parse()
            .map_err(|_| ApiError::validation("query"))?;
        VersionQuery { base_version }.validate()?;
        Some(base_version)
    } else {
        if parts.uri.query().is_some() {
            return Err(ApiError::validation("query"));
        }
        None
    };
    if matches!(method, "GET" | "DELETE") && !bytes.is_empty() {
        return Err(ApiError::validation("body"));
    }
    if !mutation {
        let principal = authentication?;
        let owner = profile::provision(&state.pool, &principal).await?;
        let value = if path == "/api/user/me" {
            serde_json::to_value(profile::get(&state.pool, &owner).await?)
                .map_err(|_| internal())?
        } else {
            serde_json::to_value(profile::get_preferences(&state.pool, &owner).await?)
                .map_err(|_| internal())?
        };
        return Ok(axum::Json(value).into_response());
    }
    if matches!(method, "PATCH" | "PUT") {
        let content_type = parts.headers.get_all("content-type");
        let valid = content_type.iter().count() == 1
            && content_type
                .iter()
                .next()
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| {
                    let media = v.split(';').next().unwrap_or("").trim();
                    media.eq_ignore_ascii_case("application/json")
                        || (media.starts_with("application/") && media.ends_with("+json"))
                });
        if !valid {
            return Err(ApiError::validation("body"));
        }
    }
    let operation_key = key(&parts.headers)?;
    // Deserialize first, then serialize the typed value for a stable field order and normalized query.
    enum Input {
        Patch(UpdateProfile),
        Put(PutPreferences),
        Delete(u64),
    }
    let input = match method {
        "PATCH" => Input::Patch(parse(&bytes)?),
        "PUT" => Input::Put(parse(&bytes)?),
        _ => Input::Delete(version.unwrap()),
    };
    let canonical = match &input {
        Input::Patch(v) => serde_json::to_vec(v),
        Input::Put(v) => serde_json::to_vec(v),
        Input::Delete(v) => serde_json::to_vec(v),
    }
    .map_err(|_| internal())?;
    let target = if let Some(v) = version {
        format!("{path}?baseVersion={v}")
    } else {
        path.to_owned()
    };
    let fingerprint = profile::sha256(
        format!(
            "{method}\n{target}\n{}",
            String::from_utf8_lossy(&canonical)
        )
        .as_bytes(),
    );
    let principal = match authentication {
        Ok(principal) => principal,
        Err(error) => {
            if method == "DELETE"
                && !parts.headers.contains_key("authorization")
                && let Some(response) =
                    replay_deleted_session(&state, &parts.headers, &operation_key, &fingerprint)
                        .await?
            {
                return Ok(response);
            }
            return Err(error);
        }
    };
    let identity = profile::identity_digest(&principal.issuer, &principal.subject);
    let mut tx = db::begin_write(&state.pool)
        .await
        .map_err(db::write_error)?;
    if let Some(row) = sqlx::query("SELECT operation_key, fingerprint, response_body FROM deleted_identities WHERE identity_digest=?").bind(&identity).fetch_optional(&mut *tx).await.map_err(|_| internal())? {
        let stored_key: Option<String> = row.get(0);
        if stored_key.as_deref() == Some(&operation_key) {
            let fingerprint: Option<Vec<u8>> = row.get(1);
            let request_fingerprint = profile::sha256(format!("{method}\n{target}\n{}", String::from_utf8_lossy(&canonical)).as_bytes());
            if fingerprint.as_deref() != Some(&request_fingerprint) { return Err(reused()); }
            let body: Vec<u8> = row.get(2);
            return Ok(([("content-type", "application/json")], body).into_response());
        }
        return Err(ApiError::new(StatusCode::FORBIDDEN,"FORBIDDEN","Account deleted"));
    }
    let owner: String =
        sqlx::query_scalar("SELECT user_id FROM identities WHERE issuer=? AND subject=?")
            .bind(&principal.issuer)
            .bind(&principal.subject)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| internal())?
            .ok_or_else(ApiError::not_found)?;
    let request = idempotency::Request {
        owner: &owner,
        key: &operation_key,
        method,
        target: &target,
        canonical_body: &canonical,
    };
    if let Some(receipt) = idempotency::claim(&mut tx, &request).await? {
        return Ok((
            receipt.status,
            [("content-type", "application/json")],
            receipt.body,
        )
            .into_response());
    }
    // Capture only the requesting live session's replay proof before its account
    // cascade. The proof is written with the acknowledgement in this transaction.
    let replay_session = if method == "DELETE" && !parts.headers.contains_key("authorization") {
        if let Some(cookie) = crate::web_auth::session_cookie(&state, &parts.headers)? {
            sqlx::query("SELECT s.id_hash,m.csrf_token,unixepoch(s.expires_at) AS expiry FROM sessions s JOIN web_session_metadata m ON m.session_hash=s.id_hash WHERE s.id_hash=? AND s.user_id=? AND unixepoch(s.expires_at)>unixepoch()")
                .bind(crate::web_auth::hash(&cookie)).bind(&owner).fetch_optional(&mut *tx).await.map_err(|_| internal())?
        } else {
            None
        }
    } else {
        None
    };
    let result = match input {
        Input::Patch(v) => serde_json::to_vec(&profile::update_tx(&mut tx, &owner, v).await?),
        Input::Put(v) => {
            serde_json::to_vec(&profile::put_preferences_tx(&mut tx, &owner, v).await?)
        }
        Input::Delete(v) => serde_json::to_vec(&profile::delete_tx(&mut tx, &owner, v).await?),
    }
    .map_err(|_| internal())?;
    if method == "DELETE" {
        let fingerprint = profile::sha256(
            format!(
                "{method}\n{target}\n{}",
                String::from_utf8_lossy(&canonical)
            )
            .as_bytes(),
        );
        sqlx::query("UPDATE deleted_identities SET operation_key=?, fingerprint=?, response_body=? WHERE identity_digest=?").bind(&operation_key).bind(fingerprint.as_slice()).bind(&result).bind(identity).execute(&mut *tx).await.map_err(|_| internal())?;
        if let Some(session) = replay_session {
            sqlx::query("DELETE FROM deleted_web_sessions WHERE expires_at<=unixepoch()")
                .execute(&mut *tx)
                .await
                .map_err(|_| internal())?;
            sqlx::query("INSERT INTO deleted_web_sessions VALUES(?,?,?,?,?,?)")
                .bind(session.get::<String, _>("id_hash"))
                .bind(session.get::<String, _>("csrf_token"))
                .bind(&operation_key)
                .bind(fingerprint.as_slice())
                .bind(&result)
                .bind(session.get::<i64, _>("expiry"))
                .execute(&mut *tx)
                .await
                .map_err(|_| internal())?;
        }
    } else {
        idempotency::complete(
            &mut tx,
            &request,
            &idempotency::Receipt {
                status: StatusCode::OK,
                body: result.clone(),
            },
        )
        .await?;
    }
    tx.commit().await.map_err(|_| internal())?;
    Ok(([("content-type", "application/json")], Body::from(result)).into_response())
}

async fn replay_deleted_session(
    state: &AppState,
    headers: &HeaderMap,
    key: &str,
    fingerprint: &[u8],
) -> Result<Option<Response>, ApiError> {
    let Some(cookie) = crate::web_auth::session_cookie(state, headers)? else {
        return Ok(None);
    };
    let row = sqlx::query("SELECT csrf_token,operation_key,fingerprint,response_body FROM deleted_web_sessions WHERE session_hash=? AND expires_at>unixepoch()")
        .bind(crate::web_auth::hash(&cookie)).fetch_optional(&state.pool).await.map_err(|_| internal())?;
    let Some(row) = row else { return Ok(None) };
    let config = state.auth.web_config().ok_or_else(internal)?;
    crate::boundary::check_session_csrf(
        headers,
        &config.external_url.origin().ascii_serialization(),
        row.get::<String, _>("csrf_token").as_bytes(),
    )?;
    if row.get::<String, _>("operation_key") != key
        || row.get::<Vec<u8>, _>("fingerprint") != fingerprint
    {
        return Err(reused());
    }
    Ok(Some(
        (
            [("content-type", "application/json")],
            row.get::<Vec<u8>, _>("response_body"),
        )
            .into_response(),
    ))
}
