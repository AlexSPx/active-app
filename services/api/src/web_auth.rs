//! Same-origin web login. Sessions expire after one hour and require a fresh login.
use crate::{AppState, boundary::ApiError, profile::VerifiedPrincipal};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone)]
pub struct WebConfig {
    pub client_id: String,
    pub client_secret: String,
    pub external_url: url::Url,
}
fn failure(status: StatusCode) -> ApiError {
    ApiError::new(
        status,
        if status == StatusCode::UNAUTHORIZED {
            "UNAUTHENTICATED"
        } else {
            "AUTH_UNAVAILABLE"
        },
        if status == StatusCode::UNAUTHORIZED {
            "Authentication required"
        } else {
            "Authentication temporarily unavailable"
        },
    )
}
fn unauthorized() -> ApiError {
    failure(StatusCode::UNAUTHORIZED)
}
fn unavailable() -> ApiError {
    failure(StatusCode::SERVICE_UNAVAILABLE)
}
fn random() -> String {
    URL_SAFE_NO_PAD.encode(
        [
            Uuid::new_v4().as_bytes().as_slice(),
            Uuid::new_v4().as_bytes().as_slice(),
        ]
        .concat(),
    )
}
pub(crate) fn hash(s: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(s.as_bytes()))
}
fn names(config: &WebConfig) -> (&'static str, &'static str, &'static str) {
    if config.external_url.scheme() == "https" {
        ("__Host-active_session", "__Host-active_flow", "; Secure")
    } else {
        ("active_session", "active_flow", "")
    }
}
fn cookie(config: &WebConfig, name: &str, value: &str, max_age: u32) -> String {
    format!(
        "{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{}",
        names(config).2
    )
}
fn get_cookie(headers: &HeaderMap, name: &str) -> Result<Option<String>, ApiError> {
    let mut found = None;
    for h in headers.get_all(header::COOKIE) {
        let h = h.to_str().map_err(|_| unauthorized())?;
        for part in h.split(';') {
            if let Some((key, value)) = part.trim().split_once('=')
                && key == name
            {
                if found.is_some()
                    || value.len() != 43
                    || !value
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                {
                    return Err(unauthorized());
                }
                found = Some(value.to_owned());
            }
        }
    }
    Ok(found)
}
pub(crate) fn session_cookie(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<String>, ApiError> {
    match state.auth.web_config() {
        Some(c) => get_cookie(headers, names(c).0),
        None => Ok(None),
    }
}
fn redirect(location: &str, cookies: &[String]) -> Result<Response, ApiError> {
    let mut r = StatusCode::SEE_OTHER.into_response();
    r.headers_mut().insert(
        header::LOCATION,
        HeaderValue::from_str(location).map_err(|_| unavailable())?,
    );
    r.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r.headers_mut().insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    for c in cookies {
        r.headers_mut().append(
            header::SET_COOKIE,
            HeaderValue::from_str(c).map_err(|_| unavailable())?,
        );
    }
    Ok(r)
}
fn callback_url(config: &WebConfig) -> Result<String, ApiError> {
    config
        .external_url
        .join("/auth/callback")
        .map(|u| u.to_string())
        .map_err(|_| unavailable())
}

pub async fn login(State(state): State<AppState>) -> Result<Response, ApiError> {
    let c = state.auth.web_config().ok_or_else(unavailable)?;
    let d = state
        .discovery
        .read()
        .await
        .clone()
        .ok_or_else(unavailable)?;
    let flow = random();
    let csrf = random();
    let nonce = random();
    let verifier = random();
    let mut tx = crate::db::begin_write(&state.pool)
        .await
        .map_err(|_| unavailable())?;
    sqlx::query("DELETE FROM web_auth_flows WHERE expires_at <= unixepoch()")
        .execute(&mut *tx)
        .await
        .map_err(|_| unavailable())?;
    let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM web_auth_flows")
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| unavailable())?;
    if pending >= 1000 {
        return Err(unavailable());
    }
    sqlx::query("INSERT INTO web_auth_flows VALUES(?,?,?,?,unixepoch()+600)")
        .bind(hash(&flow))
        .bind(&csrf)
        .bind(&nonce)
        .bind(&verifier)
        .execute(&mut *tx)
        .await
        .map_err(|_| unavailable())?;
    tx.commit().await.map_err(|_| unavailable())?;
    let mut url = url::Url::parse(&d.authorization_endpoint).map_err(|_| unavailable())?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &c.client_id)
        .append_pair("redirect_uri", &callback_url(c)?)
        .append_pair("scope", "openid profile email")
        .append_pair("state", &csrf)
        .append_pair("nonce", &nonce)
        .append_pair("resource", state.auth.resource()?)
        .append_pair("code_challenge_method", "S256")
        .append_pair("code_challenge", &hash(&verifier));
    redirect(url.as_str(), &[cookie(c, names(c).1, &flow, 600)])
}
#[derive(Deserialize)]
pub struct Callback {
    code: String,
    state: String,
    iss: String,
}
#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    id_token: String,
}
pub async fn callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<Callback>,
) -> Result<Response, ApiError> {
    let c = state.auth.web_config().ok_or_else(unavailable)?;
    let d = state
        .discovery
        .read()
        .await
        .clone()
        .ok_or_else(unavailable)?;
    let flow = get_cookie(&headers, names(c).1)?.ok_or_else(unauthorized)?;
    let row = sqlx::query("DELETE FROM web_auth_flows WHERE id_hash=? AND expires_at > unixepoch() RETURNING state,nonce,verifier").bind(hash(&flow)).fetch_optional(&state.pool).await.map_err(|_| unavailable())?.ok_or_else(unauthorized)?;
    use subtle::ConstantTimeEq;
    let expected: String = row.get("state");
    if !bool::from(expected.as_bytes().ct_eq(q.state.as_bytes()))
        || q.iss != d.issuer
        || q.code.is_empty()
        || q.code.len() > 4096
    {
        return Err(unauthorized());
    }
    let nonce: String = row.get("nonce");
    let verifier: String = row.get("verifier");
    let redirect_uri = callback_url(c)?;
    let basic_id: String = url::form_urlencoded::byte_serialize(c.client_id.as_bytes()).collect();
    let basic_secret: String =
        url::form_urlencoded::byte_serialize(c.client_secret.as_bytes()).collect();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| unavailable())?;
    let mut response = client
        .post(&d.token_endpoint)
        .basic_auth(basic_id, Some(basic_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &q.code),
            ("redirect_uri", &redirect_uri),
            ("code_verifier", &verifier),
        ])
        .send()
        .await
        .map_err(|_| unavailable())?;
    if response.status().is_server_error()
        || response.status() == StatusCode::TOO_MANY_REQUESTS
        || response.content_length().is_some_and(|n| n > 65536)
    {
        return Err(unavailable());
    }
    if !response.status().is_success() {
        return Err(unauthorized());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| unavailable())? {
        if bytes.len() + chunk.len() > 65536 {
            return Err(unavailable());
        }
        bytes.extend_from_slice(&chunk);
    }
    let tokens: Tokens = serde_json::from_slice(&bytes).map_err(|_| unauthorized())?;
    let id = state
        .auth
        .verify_web_id_token(&tokens.id_token, &nonce, &c.client_id)
        .await?;
    let access = state
        .auth
        .verify(&tokens.access_token, state.auth.resource()?, true, None)
        .await?;
    if id.sub != access.sub {
        return Err(unauthorized());
    }
    let principal = VerifiedPrincipal {
        issuer: id.iss,
        subject: id.sub,
        verified_email: id
            .email
            .filter(|v| id.email_verified == Some(true) && !v.trim().is_empty()),
    };
    let account = match crate::profile::provision(&state.pool, &principal).await {
        Ok(account) => account,
        Err(error) if error.code == "FORBIDDEN" => {
            // Reauthentication of a deleted identity grants only acknowledgement
            // recovery, never a new account or access to a deleted session.
            let row = sqlx::query("SELECT operation_key,fingerprint,response_body FROM deleted_identities WHERE identity_digest=? AND operation_key IS NOT NULL")
                .bind(crate::profile::identity_digest(&principal.issuer,&principal.subject))
                .fetch_optional(&state.pool).await.map_err(|_| unavailable())?;
            let Some(row) = row else { return Err(error) };
            let session = random();
            let csrf = random();
            let mut tx = crate::db::begin_write(&state.pool)
                .await
                .map_err(|_| unavailable())?;
            sqlx::query("DELETE FROM deleted_web_sessions WHERE expires_at<=unixepoch()")
                .execute(&mut *tx)
                .await
                .map_err(|_| unavailable())?;
            sqlx::query("INSERT INTO deleted_web_sessions VALUES(?,?,?,?,?,unixepoch()+3600)")
                .bind(hash(&session))
                .bind(csrf)
                .bind(row.get::<String, _>("operation_key"))
                .bind(row.get::<Vec<u8>, _>("fingerprint"))
                .bind(row.get::<Vec<u8>, _>("response_body"))
                .execute(&mut *tx)
                .await
                .map_err(|_| unavailable())?;
            tx.commit().await.map_err(|_| unavailable())?;
            return redirect(
                "/settings/server",
                &[
                    cookie(c, names(c).1, "", 0),
                    cookie(c, names(c).0, &session, 3600),
                ],
            );
        }
        Err(error) => return Err(error),
    };
    let session = random();
    let csrf = random();
    let hashed = hash(&session);
    let mut tx = crate::db::begin_write(&state.pool)
        .await
        .map_err(|_| unavailable())?;
    sqlx::query("DELETE FROM sessions WHERE unixepoch(expires_at)<=unixepoch()")
        .execute(&mut *tx)
        .await
        .map_err(|_| unavailable())?;
    sqlx::query("INSERT INTO sessions(id_hash,user_id,expires_at) SELECT ?,id,strftime('%Y-%m-%dT%H:%M:%SZ','now','+1 hour') FROM users WHERE id=? AND EXISTS (SELECT 1 FROM identities WHERE user_id=users.id AND issuer=? AND subject=?)").bind(&hashed).bind(&account).bind(&principal.issuer).bind(&principal.subject).execute(&mut *tx).await.map_err(|_| unavailable())?;
    sqlx::query("INSERT INTO web_session_metadata VALUES(?,?,?,?)")
        .bind(&hashed)
        .bind(&csrf)
        .bind(&principal.issuer)
        .bind(&principal.subject)
        .execute(&mut *tx)
        .await
        .map_err(|_| unavailable())?;
    tx.commit().await.map_err(|_| unavailable())?;
    redirect(
        "/settings/server",
        &[
            cookie(c, names(c).1, "", 0),
            cookie(c, names(c).0, &session, 3600),
        ],
    )
}
async fn lookup(
    state: &AppState,
    value: &str,
) -> Result<(String, String, VerifiedPrincipal), ApiError> {
    let row = sqlx::query("SELECT s.user_id,m.csrf_token,m.issuer,m.subject FROM sessions s JOIN web_session_metadata m ON m.session_hash=s.id_hash JOIN identities i ON i.user_id=s.user_id AND i.issuer=m.issuer AND i.subject=m.subject WHERE s.id_hash=? AND unixepoch(s.expires_at)>unixepoch()").bind(hash(value)).fetch_optional(&state.pool).await.map_err(|_| unavailable())?.ok_or_else(unauthorized)?;
    Ok((
        row.get("user_id"),
        row.get("csrf_token"),
        VerifiedPrincipal {
            issuer: row.get("issuer"),
            subject: row.get("subject"),
            verified_email: None,
        },
    ))
}
pub(crate) async fn authenticate_session(
    state: &AppState,
    headers: &HeaderMap,
    value: &str,
    mutation: bool,
) -> Result<VerifiedPrincipal, ApiError> {
    let (_, csrf, principal) = lookup(state, value).await?;
    if mutation {
        let c = state.auth.web_config().ok_or_else(unavailable)?;
        crate::boundary::check_session_csrf(
            headers,
            &c.external_url.origin().ascii_serialization(),
            csrf.as_bytes(),
        )?;
    }
    Ok(principal)
}
pub async fn session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if headers.contains_key(header::AUTHORIZATION) {
        return Err(unauthorized());
    }
    let value = session_cookie(&state, &headers)?.ok_or_else(unauthorized)?;
    let (account, csrf, deleted) = match lookup(&state, &value).await {
        Ok((account, csrf, _)) => (account, csrf, false),
        Err(error) if error.code == "UNAUTHENTICATED" => {
            let Some((account, csrf)) = deleted_session(&state, &value).await? else {
                return Err(error);
            };
            (account, csrf, true)
        }
        Err(error) => return Err(error),
    };
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"csrfToken":csrf,"accountId":account,"deleted":deleted})),
    )
        .into_response())
}
pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if headers.contains_key(header::AUTHORIZATION) {
        return Err(unauthorized());
    }
    let c = state.auth.web_config().ok_or_else(unavailable)?;
    let value = session_cookie(&state, &headers)?.ok_or_else(unauthorized)?;
    match authenticate_session(&state, &headers, &value, true).await {
        Ok(_) => (),
        Err(error) if error.code == "UNAUTHENTICATED" => {
            let Some((_, csrf)) = deleted_session(&state, &value).await? else {
                return Err(error);
            };
            crate::boundary::check_session_csrf(
                &headers,
                &c.external_url.origin().ascii_serialization(),
                csrf.as_bytes(),
            )?;
        }
        Err(error) => return Err(error),
    }
    sqlx::query("DELETE FROM sessions WHERE id_hash=?")
        .bind(hash(&value))
        .execute(&state.pool)
        .await
        .map_err(|_| unavailable())?;
    sqlx::query("DELETE FROM deleted_web_sessions WHERE session_hash=?")
        .bind(hash(&value))
        .execute(&state.pool)
        .await
        .map_err(|_| unavailable())?;
    let mut r = StatusCode::NO_CONTENT.into_response();
    r.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie(c, names(c).0, "", 0)).map_err(|_| unavailable())?,
    );
    Ok(r)
}

async fn deleted_session(
    state: &AppState,
    value: &str,
) -> Result<Option<(String, String)>, ApiError> {
    let row=sqlx::query("SELECT response_body,csrf_token FROM deleted_web_sessions WHERE session_hash=? AND expires_at>unixepoch()")
        .bind(hash(value)).fetch_optional(&state.pool).await.map_err(|_| unavailable())?;
    let Some(row) = row else { return Ok(None) };
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Acknowledgement {
        deleted_user_id: String,
    }
    let ack: Acknowledgement = serde_json::from_slice(&row.get::<Vec<u8>, _>("response_body"))
        .map_err(|_| unavailable())?;
    Ok(Some((ack.deleted_user_id, row.get("csrf_token"))))
}
