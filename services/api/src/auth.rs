use crate::{AppState, boundary::ApiError, profile::VerifiedPrincipal};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const TTL: Duration = Duration::from_secs(300);
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const MAX_DOCUMENT: usize = 65536;

#[derive(Clone)]
pub struct AuthState {
    config: Option<AuthConfig>,
    web_config: Option<crate::web_auth::WebConfig>,
    client: reqwest::Client,
    cache: Arc<Mutex<Cache>>,
}
#[derive(Clone)]
pub struct AuthConfig {
    pub issuer: String,
    pub client_id: String,
    pub resource: String,
    pub redirect_uri: String,
}
#[derive(Default)]
struct Cache {
    keys: HashMap<String, DecodingKey>,
    loaded: Option<Instant>,
    last_attempt: Option<Instant>,
    failed: bool,
}
#[derive(Deserialize)]
struct Metadata {
    issuer: String,
    jwks_uri: String,
}
#[derive(Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}
#[derive(Deserialize)]
struct Jwk {
    kid: Option<String>,
    kty: String,
    n: Option<String>,
    e: Option<String>,
    alg: Option<String>,
    #[serde(rename = "use")]
    usage: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct Claims {
    pub iss: String,
    pub sub: String,
    pub exp: u64,
    pub email: Option<String>,
    pub email_verified: Option<bool>,
    pub nonce: Option<String>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            config: None,
            web_config: None,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("HTTP client"),
            cache: Arc::new(Mutex::new(Cache::default())),
        }
    }
}
impl AuthState {
    pub fn set_web_config(&mut self, config: Option<crate::web_auth::WebConfig>) {
        self.web_config = config;
    }
    pub(crate) fn web_config(&self) -> Option<&crate::web_auth::WebConfig> {
        self.web_config.as_ref()
    }
    pub fn new(config: AuthConfig) -> Self {
        Self {
            config: Some(config),
            ..Self::default()
        }
    }
    async fn document<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T, ApiError> {
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| unavailable())?;
        if !response.status().is_success() {
            return Err(unavailable());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| unavailable())? {
            if bytes.len() + chunk.len() > MAX_DOCUMENT {
                return Err(unavailable());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| unavailable())
    }
    async fn key(&self, kid: &str) -> Result<DecodingKey, ApiError> {
        let config = self.config.as_ref().ok_or_else(unavailable)?;
        let mut cache = self.cache.lock().await;
        let now = Instant::now();
        let fresh = cache.loaded.is_some_and(|t| now.duration_since(t) < TTL);
        if fresh && let Some(key) = cache.keys.get(kid) {
            return Ok(key.clone());
        }
        if cache
            .last_attempt
            .is_some_and(|t| now.duration_since(t) < REFRESH_INTERVAL)
        {
            return if fresh {
                Err(unauthorized())
            } else {
                Err(unavailable())
            };
        }
        cache.last_attempt = Some(now);
        cache.failed = true;
        let metadata: Metadata = self
            .document(&format!(
                "{}/.well-known/openid-configuration",
                config.issuer.trim_end_matches('/')
            ))
            .await?;
        if metadata.issuer != config.issuer {
            return Err(unavailable());
        }
        let issuer = url::Url::parse(&config.issuer).map_err(|_| unavailable())?;
        let jwks_url = url::Url::parse(&metadata.jwks_uri).map_err(|_| unavailable())?;
        if !crate::config::endpoint(&metadata.jwks_uri) || issuer.origin() != jwks_url.origin() {
            return Err(unavailable());
        }
        let jwks: Jwks = self.document(&metadata.jwks_uri).await?;
        let mut keys = HashMap::new();
        for key in jwks.keys {
            if key.kty != "RSA"
                || key.alg.as_deref().is_some_and(|v| v != "RS256")
                || key.usage.as_deref().is_some_and(|v| v != "sig")
            {
                continue;
            }
            if let (Some(kid), Some(n), Some(e)) = (key.kid, key.n, key.e) {
                if kid.is_empty() || keys.contains_key(&kid) {
                    return Err(unavailable());
                }
                let decoding =
                    DecodingKey::from_rsa_components(&n, &e).map_err(|_| unavailable())?;
                keys.insert(kid, decoding);
            }
        }
        if keys.is_empty() {
            return Err(unavailable());
        }
        cache.failed = false;
        if !fresh {
            cache.last_attempt = None;
        }
        cache.keys = keys;
        cache.loaded = Some(Instant::now());
        cache.keys.get(kid).cloned().ok_or_else(unauthorized)
    }
    pub(crate) async fn verify(
        &self,
        token: &str,
        audience: &str,
        access: bool,
        nonce: Option<&str>,
    ) -> Result<Claims, ApiError> {
        if token.len() > 16384 {
            return Err(unauthorized());
        }
        let header = decode_header(token).map_err(|_| unauthorized())?;
        if header.alg != Algorithm::RS256
            || (access && header.typ.as_deref() != Some("at+jwt"))
            || (!access && header.typ.as_deref() == Some("at+jwt"))
        {
            return Err(unauthorized());
        }
        let kid = header
            .kid
            .as_deref()
            .filter(|s| !s.is_empty() && s.len() <= 256)
            .ok_or_else(unauthorized)?;
        let config = self.config.as_ref().ok_or_else(unavailable)?;
        let key = self.key(kid).await?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&config.issuer]);
        validation.set_audience(&[audience]);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        validation.leeway = 0;
        validation.validate_nbf = true;
        let claims = decode::<Claims>(token, &key, &validation)
            .map_err(|_| unauthorized())?
            .claims;
        if claims.sub.trim().is_empty() || nonce.is_some_and(|n| claims.nonce.as_deref() != Some(n))
        {
            return Err(unauthorized());
        }
        Ok(claims)
    }
    pub async fn verify_web_id_token(
        &self,
        token: &str,
        nonce: &str,
        audience: &str,
    ) -> Result<Claims, ApiError> {
        if nonce.is_empty() || audience.is_empty() {
            return Err(unauthorized());
        }
        self.verify(token, audience, false, Some(nonce)).await
    }
    pub(crate) fn resource(&self) -> Result<&str, ApiError> {
        Ok(&self.config.as_ref().ok_or_else(unavailable)?.resource)
    }
    pub async fn verify_id_token(&self, token: &str, nonce: &str) -> Result<Claims, ApiError> {
        let config = self.config.as_ref().ok_or_else(unavailable)?;
        if nonce.is_empty() {
            return Err(unauthorized());
        }
        self.verify(token, &config.client_id, false, Some(nonce))
            .await
    }
}
fn unauthorized() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "UNAUTHENTICATED",
        "Authentication required",
    )
}
fn unavailable() -> ApiError {
    ApiError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "AUTH_UNAVAILABLE",
        "Authentication temporarily unavailable",
    )
}

pub async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
    mutation: bool,
) -> Result<VerifiedPrincipal, ApiError> {
    let values = headers.get_all(axum::http::header::AUTHORIZATION);
    let cookie = crate::web_auth::session_cookie(state, headers)?;
    if cookie.is_some() && values.iter().count() != 0 {
        return Err(unauthorized());
    }
    if let Some(cookie) = cookie {
        return crate::web_auth::authenticate_session(state, headers, &cookie, mutation).await;
    }
    if values.iter().count() != 1 {
        return Err(unauthorized());
    }
    let value = values
        .iter()
        .next()
        .and_then(|v| v.to_str().ok())
        .ok_or_else(unauthorized)?;
    let token = value
        .strip_prefix("Bearer ")
        .filter(|s| !s.is_empty() && !s.contains(char::is_whitespace))
        .ok_or_else(unauthorized)?;
    let config = state.auth.config.as_ref().ok_or_else(unavailable)?;
    let claims = state
        .auth
        .verify(token, &config.resource, true, None)
        .await?;
    Ok(VerifiedPrincipal {
        issuer: claims.iss,
        subject: claims.sub,
        verified_email: claims
            .email
            .filter(|v| claims.email_verified == Some(true) && !v.trim().is_empty()),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeConfig {
    issuer: String,
    client_id: String,
    resource: String,
    authorization_endpoint: String,
    token_endpoint: String,
    end_session_endpoint: String,
    redirect_uri: String,
}
pub async fn native_config(State(state): State<AppState>) -> Response {
    let (Some(config), Some(discovery)) = (
        state.auth.config.as_ref(),
        state.discovery.read().await.clone(),
    ) else {
        let mut response = unavailable().into_response();
        response.headers_mut().insert(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-store"),
        );
        return response;
    };
    let mut response = Json(NativeConfig {
        issuer: discovery.issuer,
        client_id: config.client_id.clone(),
        resource: config.resource.clone(),
        authorization_endpoint: discovery.authorization_endpoint,
        token_endpoint: discovery.token_endpoint,
        end_session_endpoint: discovery.end_session_endpoint,
        redirect_uri: config.redirect_uri.clone(),
    })
    .into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeVerify {
    id_token: String,
    access_token: String,
    nonce: String,
}
pub async fn native_verify(
    State(state): State<AppState>,
    Json(input): Json<NativeVerify>,
) -> Result<impl IntoResponse, ApiError> {
    let config = state.auth.config.as_ref().ok_or_else(unavailable)?;
    let id = state
        .auth
        .verify_id_token(&input.id_token, &input.nonce)
        .await?;
    let access = state
        .auth
        .verify(&input.access_token, &config.resource, true, None)
        .await?;
    if id.sub != access.sub {
        return Err(unauthorized());
    }
    Ok((
        [(axum::http::header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"subject": id.sub})),
    ))
}

pub async fn native_identity(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    if crate::web_auth::session_cookie(&state, &headers)?.is_some() {
        return Err(unauthorized());
    }
    let principal = authenticate(&state, &headers, false).await?;
    Ok((
        [(axum::http::header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"subject": principal.subject})),
    ))
}
