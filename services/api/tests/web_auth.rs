use active_api::{
    app,
    auth::{AuthConfig, AuthState},
    bootstrap_auth,
    config::Config,
    db, initialize,
    web_auth::WebConfig,
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    routing::{get, post},
};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tower::ServiceExt;
use url::Url;
const KEY1: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCjqA3fsbm6w2hf
DorWtV4GO/GzsOQEFgsMa5LT9cqzUYwR1noRVrzVGoMIAx0Fp3rl1ZHPURMJljFY
Eot7VTbuvVP3aYcYWCXzpmuqMfU7BYdayrEAHTcYtl4s3T30u+9eDafozx62oRQZ
09eBbIxdqgQ4Qggo+QpCYnTgXoBMvKJGzdcNUypUtuUbSotcbfTBCGHjAlZCjw+w
lAYnAQ/+6klnxqtyE7XDdVLC22maS87504iGBU9m+PElF+XLanXfHgBBOWMDkhHf
ULftt3YPBvCD/4TVNv24AJbGlNkn034CSCWh3dbG2S2YwuXB8CshyajRlZvGSCO3
2LkN7q9jAgMBAAECggEAAwn+3/WL7mTsjj9V4rDRgyofzeduBIloQR3KRzdcQUI1
aKtj7uh+bzKj1kVAh7dZd+UkZQYrZVUtq2YEwxCNCZfodEK4aIJSihjADRQKasMq
hUwYR1lDiajxTMH7AY1v334/bPpTpq6NEgG2EcgzPxYGKAlJ34DoaN0tMHFwznv2
qFsx/9xGBORmYvaRTpN2VM8ZT2R3BHnta6d0FjhrHYH9kgsDS5yWL3Rgava9VVSS
LMIziN41R+5Kw78abVuLf3FPkj6b30Gbo2HCgofE+r4pIzXJWBaZW40Jm9RQPk3j
td1aUYE1kn7DxWF+TisAfIpS4j7cZ5EqjvrA1JCY4QKBgQDTaqaTl+R5t5Q09s8K
tolkreJVbKMJJnfJCplsFYPPtizqFbLd3HXgC5gYkeiZA+9N8TDqrAiPeHYDwzVl
VdVO0q3eeb1QpHRrA3vFNXPlETM4bSI5AigU8r8H2fB1OuLACrdEZxgIOw+5rGit
4pKGiBeUDS3pbCDrxXm73t8c8QKBgQDGKxEaAeQXpu8XxTO3GWzkKLl7Nxpt7+2l
0OrhPIFjN+Oj44Tm5+O2/3n3pd8wfma0gD9EpanW1LpQc180bMDvunDClSwc6uZZ
3x0fQO9RW2efZmTbhakBI9T7fqTLtczEwAT00olrUkoiELAbwaQvG/G6ncD1yRmE
58mtmnYhkwKBgQCBjkywC5euYypGXqy30u5VLR2S3bT3KYSkRYOJMZIJ2oihllR7
EtuFRXWaMOfJxRiDufcRCAVi7h3b5mc1RyklWYPE3vN9lJnm7kaNrljsGeM6g95B
8yle1Pbtt8db/47uwmJWX5rhiFf1n0qyrDLAkGtqhb0J2wI9mVElKMmu8QKBgQDA
Kb0AqjrD0MXjGACJGiekq/UJDascVl/tvkQ1u9WAIA8nupYCz3Ta3KwqQHfIb5oq
iH5RlA+42jn9j5MPpDIHhZSYq8zGEebj2V5FE1O+YdN/F+zPjrIO/+8lHW6yd42k
cMudmJdXMcnfdK1BjSon4IIsw5L9BFAxuA6ywKiy7wKBgQCgyceN+qHwAkc9m4AX
2p7+TQsncnGz/aiAXAO/FtoIkd7HCxvMeod/lf9RciCSut1VO8NkCMMhGuPKKNSJ
nhLL+4R5rGDagN//nYlPA5xZrCaosGpKaY7LvASZmASr5Jpz8/b+MRgfxKjf/yOP
PFSLdQ/MHXqRr22r99lfDm7/Hg==
-----END PRIVATE KEY-----
"#;
const N1: &str = "o6gN37G5usNoXw6K1rVeBjvxs7DkBBYLDGuS0_XKs1GMEdZ6EVa81RqDCAMdBad65dWRz1ETCZYxWBKLe1U27r1T92mHGFgl86ZrqjH1OwWHWsqxAB03GLZeLN099LvvXg2n6M8etqEUGdPXgWyMXaoEOEIIKPkKQmJ04F6ATLyiRs3XDVMqVLblG0qLXG30wQhh4wJWQo8PsJQGJwEP_upJZ8archO1w3VSwttpmkvO-dOIhgVPZvjxJRfly2p13x4AQTljA5IR31C37bd2Dwbwg_-E1Tb9uACWxpTZJ9N-Akglod3WxtktmMLlwfArIcmo0ZWbxkgjt9i5De6vYw";

#[tokio::test]
async fn login_callback_session_logout_and_replay() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let nonce = Arc::new(Mutex::new(String::new()));
    let n = nonce.clone();
    let iss = issuer.clone();
    let discovery = issuer.clone();
    let provider=Router::new().route("/.well-known/openid-configuration",get(move || {let i=discovery.clone();async move {Json(json!({"issuer":i,"jwks_uri":format!("{i}/jwks"),"authorization_endpoint":format!("{i}/authorize"),"token_endpoint":format!("{i}/token"),"end_session_endpoint":format!("{i}/logout")}))}})).route("/jwks",get(|| async {Json(json!({"keys":[{"kid":"one","kty":"RSA","alg":"RS256","n":N1,"e":"AQAB"}]}))})).route("/token",post(move || {let i=iss.clone();let n=n.lock().unwrap().clone();async move {
 let exp=chrono::Utc::now().timestamp()+300;
 let sign=|typ:&str,claims:Value| {let mut h=Header::new(Algorithm::RS256);h.kid=Some("one".into());h.typ=Some(typ.into());encode(&h,&claims,&EncodingKey::from_rsa_pem(KEY1.as_bytes()).unwrap()).unwrap()};
 Json(json!({"id_token":sign("JWT",json!({"iss":i,"sub":"user","aud":"web","exp":exp,"nonce":n,"email":"a@example.com","email_verified":true})),"access_token":sign("at+jwt",json!({"iss":i,"sub":"user","aud":"api","exp":exp}))}))
 }}));
    let server = tokio::spawn(async move { axum::serve(listener, provider).await.unwrap() });
    let dir = tempfile::tempdir().unwrap();
    let config = Config {
        listen: "127.0.0.1:0".parse().unwrap(),
        database: dir.path().join("db"),
        external_url: Url::parse("http://localhost:3000").unwrap(),
        origins: vec![],
        issuer: Url::parse(&issuer).unwrap(),
        body_limit: 65536,
        request_timeout: Duration::from_secs(5),
        shutdown_timeout: Duration::from_secs(5),
    };
    let mut state = initialize(db::open(&config.database).await.unwrap(), &config)
        .await
        .unwrap();
    state.auth = AuthState::new(AuthConfig {
        issuer: issuer.clone(),
        client_id: "native".into(),
        resource: "api".into(),
        redirect_uri: "active://callback".into(),
    });
    state.auth.set_web_config(Some(WebConfig {
        client_id: "web".into(),
        client_secret: "secret".into(),
        external_url: config.external_url.clone(),
    }));
    bootstrap_auth(&state, &config.issuer, &reqwest::Client::new())
        .await
        .unwrap();
    let call = |uri: &str, cookie: &str| {
        Request::builder()
            .uri(uri)
            .header("cookie", cookie)
            .body(Body::empty())
            .unwrap()
    };
    for invalid in ["state", "issuer", "nonce"] {
        let response = app(state.clone())
            .oneshot(call("/auth/login", ""))
            .await
            .unwrap();
        let flow = response.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_owned();
        let url = Url::parse(response.headers()["location"].to_str().unwrap()).unwrap();
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        *nonce.lock().unwrap() = if invalid == "nonce" {
            "wrong".into()
        } else {
            pairs["nonce"].clone()
        };
        let callback = format!(
            "/auth/callback?code=abc&state={}&iss={}",
            if invalid == "state" {
                "wrong"
            } else {
                &pairs["state"]
            },
            url::form_urlencoded::byte_serialize(if invalid == "issuer" {
                b"https://evil.example"
            } else {
                issuer.as_bytes()
            })
            .collect::<String>()
        );
        let response = app(state.clone())
            .oneshot(call(&callback, &flow))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{invalid}");
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions")
                .fetch_one(&state.pool)
                .await
                .unwrap(),
            0
        );
    }
    let response = app(state.clone())
        .oneshot(call("/auth/login", ""))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let flow = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let url = Url::parse(response.headers()["location"].to_str().unwrap()).unwrap();
    let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    *nonce.lock().unwrap() = pairs["nonce"].clone();
    let callback = format!(
        "/auth/callback?code=abc&state={}&iss={}",
        pairs["state"],
        url::form_urlencoded::byte_serialize(issuer.as_bytes()).collect::<String>()
    );
    let response = app(state.clone())
        .oneshot(call(&callback, &flow))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let session = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap())
        .find(|v| v.starts_with("active_session="))
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    assert_eq!(
        app(state.clone())
            .oneshot(call(&callback, &flow))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let response = app(state.clone())
        .oneshot(call("/auth/session", &session))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 1024).await.unwrap()).unwrap();
    let csrf = body["csrfToken"].as_str().unwrap();
    sqlx::query("UPDATE sessions SET expires_at='2000-01-01T00:00:00Z'")
        .execute(&state.pool)
        .await
        .unwrap();
    assert_eq!(
        app(state.clone())
            .oneshot(call("/auth/session", &session))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    sqlx::query("UPDATE sessions SET expires_at=strftime('%Y-%m-%dT%H:%M:%SZ','now','+1 hour')")
        .execute(&state.pool)
        .await
        .unwrap();
    let ambiguous = Request::builder()
        .uri("/auth/session")
        .header("cookie", &session)
        .header("authorization", "Bearer anything")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app(state.clone())
            .oneshot(ambiguous)
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let logout = |origin: &str, token: &str| {
        Request::builder()
            .method("POST")
            .uri("/auth/logout")
            .header("cookie", &session)
            .header("origin", origin)
            .header("x-csrf-token", token)
            .body(Body::empty())
            .unwrap()
    };
    assert_eq!(
        app(state.clone())
            .oneshot(logout("http://evil", csrf))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app(state.clone())
            .oneshot(logout("http://localhost:3000", "wrong"))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app(state.clone())
            .oneshot(logout("http://localhost:3000", csrf))
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app(state.clone())
            .oneshot(call("/auth/session", &session))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    // A new browser session can delete and replay only its original acknowledgement.
    let response = app(state.clone())
        .oneshot(call("/auth/login", ""))
        .await
        .unwrap();
    let flow = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let url = Url::parse(response.headers()["location"].to_str().unwrap()).unwrap();
    let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    *nonce.lock().unwrap() = pairs["nonce"].clone();
    let callback = format!(
        "/auth/callback?code=again&state={}&iss={}",
        pairs["state"],
        url::form_urlencoded::byte_serialize(issuer.as_bytes()).collect::<String>()
    );
    let response = app(state.clone())
        .oneshot(call(&callback, &flow))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let cookie = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap())
        .find(|v| v.starts_with("active_session="))
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let response = app(state.clone())
        .oneshot(call("/auth/session", &cookie))
        .await
        .unwrap();
    let info: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 1024).await.unwrap()).unwrap();
    let csrf = info["csrfToken"].as_str().unwrap();
    let deletion = |key: &str, csrf: &str| {
        Request::builder()
            .method("DELETE")
            .uri("/api/user/me?baseVersion=1")
            .header("x-active-contract-version", "1")
            .header("idempotency-key", key)
            .header("cookie", &cookie)
            .header("origin", "http://localhost:3000")
            .header("x-csrf-token", csrf)
            .body(Body::empty())
            .unwrap()
    };
    let first = app(state.clone())
        .oneshot(deletion("delete", csrf))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let acknowledgement = to_bytes(first.into_body(), 1024).await.unwrap();
    let recovery_info = app(state.clone())
        .oneshot(call("/auth/session", &cookie))
        .await
        .unwrap();
    assert_eq!(recovery_info.status(), StatusCode::OK);
    let recovery_info: Value =
        serde_json::from_slice(&to_bytes(recovery_info.into_body(), 1024).await.unwrap()).unwrap();
    assert_eq!(recovery_info["deleted"], true);
    let protected = Request::builder()
        .uri("/api/user/me")
        .header("x-active-contract-version", "1")
        .header("cookie", &cookie)
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app(state.clone())
            .oneshot(protected)
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let mut reopened = state.clone();
    reopened.pool = db::open(&config.database).await.unwrap();
    let replay = app(reopened)
        .oneshot(deletion("delete", csrf))
        .await
        .unwrap();
    assert_eq!(replay.status(), StatusCode::OK);
    assert_eq!(
        to_bytes(replay.into_body(), 1024).await.unwrap(),
        acknowledgement
    );
    assert_eq!(
        app(state.clone())
            .oneshot(deletion("different", csrf))
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        app(state.clone())
            .oneshot(deletion("delete", "wrong"))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM users")
            .fetch_one(&state.pool)
            .await
            .unwrap(),
        0
    );
    sqlx::query("UPDATE deleted_web_sessions SET expires_at=0")
        .execute(&state.pool)
        .await
        .unwrap();
    assert_eq!(
        app(state.clone())
            .oneshot(deletion("delete", csrf))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    // Fresh OIDC authentication can recover the receipt after the old session expires.
    let response = app(state.clone())
        .oneshot(call("/auth/login", ""))
        .await
        .unwrap();
    let flow = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let url = Url::parse(response.headers()["location"].to_str().unwrap()).unwrap();
    let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    *nonce.lock().unwrap() = pairs["nonce"].clone();
    let callback = format!(
        "/auth/callback?code=recover&state={}&iss={}",
        pairs["state"],
        url::form_urlencoded::byte_serialize(issuer.as_bytes()).collect::<String>()
    );
    let response = app(state.clone())
        .oneshot(call(&callback, &flow))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let cookie = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap())
        .find(|v| v.starts_with("active_session="))
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let info = app(state.clone())
        .oneshot(call("/auth/session", &cookie))
        .await
        .unwrap();
    let info: Value =
        serde_json::from_slice(&to_bytes(info.into_body(), 1024).await.unwrap()).unwrap();
    assert_eq!(info["deleted"], true);
    let replay = Request::builder()
        .method("DELETE")
        .uri("/api/user/me?baseVersion=1")
        .header("x-active-contract-version", "1")
        .header("idempotency-key", "delete")
        .header("cookie", &cookie)
        .header("origin", "http://localhost:3000")
        .header("x-csrf-token", info["csrfToken"].as_str().unwrap())
        .body(Body::empty())
        .unwrap();
    let replay = app(state.clone()).oneshot(replay).await.unwrap();
    assert_eq!(replay.status(), StatusCode::OK);
    assert_eq!(
        to_bytes(replay.into_body(), 1024).await.unwrap(),
        acknowledgement
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM users")
            .fetch_one(&state.pool)
            .await
            .unwrap(),
        0
    );
    server.abort();
}
