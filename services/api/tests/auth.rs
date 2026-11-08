use active_api::{
    app,
    auth::{self, AuthConfig, AuthState},
    bootstrap_auth,
    config::Config,
    db, initialize,
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{HeaderMap, Request, StatusCode},
    routing::get,
};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde_json::{Value, json};
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
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
const KEY2: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCwiPn8d1BZWdJ8
yKIATRuKHDYYC8X75Z1jK+iAx3X+4lV5ofSQ0ltJOdHhQuG5U/EM75k0g+hEcP5a
neJ59zkY2q61mzq+/yUASZ9AgdI4fUH23QTSWIOD4usrv6lcOYCz40z+aao/+BKR
cfOKrGe7UDwc1SBAQqgkajhRTujX8UMU45AFh8PTiAHneTKnHoxTDTSVMKQ/Up6x
aNx3v7ZgxZjAnWjamnmB5seAWzNwO3LKk7SnTT8bY4rnzcSoMaUzP6dUbj6GNibQ
CeMvDQ5JB6/uF+DTiyiSYMwAZY/mbmIAFhA/eYM2ABLpfkgEN3kyiK7f48gH4Lwi
GsL54z8DAgMBAAECggEAGj46n2fjR20dZ9RxlMbhra3U8s0pQPGY7Im19hLwvRPL
bhn/39mNnXydcTW+lYzffDNQHKjxSd9cSH9JECWK1OGJcFDjskn+p6TKKk5CQIiK
Wlbv5Q8oed4tZKMI279mnRdQtk9h8kGADSQZ9sb7YrKiRQz/zt253jP2LEwlPBiP
u8dowGVZg4LQdYdwubPJoVa4Dl/0nAEwTtP5W6dtnzExy6eFducyw8RHSp3lqg+K
uUi8Ef4YY4MG6DY96LWwoZT93BSl3laQh7heVHc5pBIOtm3NlxZ482+NoAyS+N4d
fBHmC0fyW/o3JzD9CijgK7mRwpkq9Z9PfcBnx5KXxQKBgQDgEtrPCtedb86XqbWw
pnRJDmB+RUDAUYVzebHlwl9MBI4a3rAZIh6/0E7CSRt01Vc8ekq5QmIzMFfKJg5+
5eBUwc50m2w5ooZMP9m05jyEtTgbSe0aTytvLnW1lS17Ete0ARpMNr4U0XTJloTc
xXmUM5TM059JA5wrOCB+TaXjDwKBgQDJsCOsZYoQen9biyoE9idy8aGgTZkgFx0U
uXK36sobHrHjeM/q+mF71ufOzLf3QjB1nlqhbiMLj4N1T3P8no1z1KIZt/TlL+C0
mWM/g1uC/MEltwHL63f2ngQMe8tcfAGdw+4IgZrYMpO+exutdVIPSRX6MRU/0FMy
/I7Sg7zUzQKBgH5bg5JvvcklTK4P4Mp+A2NTPSzXpr0M+6FzxdMX+h9nDi+u1kVG
DWsDb/Z1vYrz557OI6c2/SN6pnbzYQdEYG3LYL43Cx+xO+RxuTYfA4+elcYluRQ2
AvtOishcGGqn5IW4fXjvAd/BggdP3xqULYxaThX3XIKTC5T/sKso5FwXAoGAW7lU
b/n50Ua0lwBySrFb/YVwmQPRaOu6GQvB5WzNH4pVInt2K4pVPUneQImP/M5IVaV/
2DzLiV1qTrakrDW7ZPtGAWZM5NJiYiAEKAVoX+jtOmbBVWkwNKNmefru4I+w+Hv7
zDiNIFfYI1+/laJugG8fpJof7Nakj+KWXZz2Ct0CgYEAvLzITj/6PX3nIjeucz9x
6h9g94mqOFEoOSKzOcbNyv3MygmSDk9Qr9yC6cgY73GDCxUqAPuPXc11pSOLiVA1
IMkrNxI9w5HBXqx+OaN33Jb4ra7SFWyWIyNK2OHx2qdjYP6PrqHaubfjiW+01Dx5
tJEJu99hN06CMPddqXylDWU=
-----END PRIVATE KEY-----
"#;
const N2: &str = "sIj5_HdQWVnSfMiiAE0bihw2GAvF--WdYyvogMd1_uJVeaH0kNJbSTnR4ULhuVPxDO-ZNIPoRHD-Wp3iefc5GNqutZs6vv8lAEmfQIHSOH1B9t0E0liDg-LrK7-pXDmAs-NM_mmqP_gSkXHziqxnu1A8HNUgQEKoJGo4UU7o1_FDFOOQBYfD04gB53kypx6MUw00lTCkP1KesWjcd7-2YMWYwJ1o2pp5gebHgFszcDtyypO0p00_G2OK583EqDGlMz-nVG4-hjYm0AnjLw0OSQev7hfg04sokmDMAGWP5m5iABYQP3mDNgAS6X5IBDd5Moiu3-PIB-C8IhrC-eM_Aw";

fn token(key: &str, kid: &str, typ: &str, claims: Value) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(kid.into());
    header.typ = Some(typ.into());
    encode(
        &header,
        &claims,
        &EncodingKey::from_rsa_pem(key.as_bytes()).unwrap(),
    )
    .unwrap()
}
#[tokio::test]
async fn verifies_bearer_and_native_tokens_with_rotation_and_outage() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let rotation = Arc::new(AtomicUsize::new(0));
    let r = rotation.clone();
    let iss = issuer.clone();
    let provider = Router::new().route("/.well-known/openid-configuration", get(move || {let iss=iss.clone(); async move {Json(json!({"issuer":iss,"jwks_uri":format!("{iss}/jwks"),"authorization_endpoint":format!("{iss}/authorize"),"token_endpoint":format!("{iss}/token"),"end_session_endpoint":format!("{iss}/logout")}))}}))
 .route("/jwks", get(move || { let r=r.clone(); async move {let (kid,n)=if r.load(Ordering::SeqCst)==0 {("one",N1)} else {("two",N2)}; Json(json!({"keys":[{"kid":kid,"kty":"RSA","alg":"RS256","n":n,"e":"AQAB"}]}))} }));
    let server = tokio::spawn(async move { axum::serve(listener, provider).await.unwrap() });
    let dir = tempfile::tempdir().unwrap();
    let config = Config {
        listen: "127.0.0.1:0".parse().unwrap(),
        database: dir.path().join("db"),
        external_url: Url::parse("http://localhost").unwrap(),
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
        client_id: "client".into(),
        resource: "api".into(),
        redirect_uri: "active://callback".into(),
    });
    bootstrap_auth(&state, &config.issuer, &reqwest::Client::new())
        .await
        .unwrap();
    let exp = chrono::Utc::now().timestamp() + 300;
    let claims = json!({"iss":issuer,"sub":"user","aud":"api","exp":exp,"email":"a@example.com","email_verified":true});
    let good = token(KEY1, "one", "at+jwt", claims.clone());
    let mut headers = HeaderMap::new();
    headers.insert("authorization", format!("Bearer {good}").parse().unwrap());
    assert_eq!(
        auth::authenticate(&state, &headers, false)
            .await
            .unwrap()
            .verified_email
            .as_deref(),
        Some("a@example.com")
    );
    for (key, typ, changes) in [
        (KEY2, "at+jwt", json!({})),
        (KEY1, "JWT", json!({})),
        (KEY1, "at+jwt", json!({"iss":"wrong"})),
        (KEY1, "at+jwt", json!({"aud":"wrong"})),
        (KEY1, "at+jwt", json!({"exp":1})),
    ] {
        let mut c = claims.clone();
        c.as_object_mut()
            .unwrap()
            .extend(changes.as_object().unwrap().clone());
        headers.insert(
            "authorization",
            format!("Bearer {}", token(key, "one", typ, c))
                .parse()
                .unwrap(),
        );
        assert!(auth::authenticate(&state, &headers, false).await.is_err());
    }
    let id = token(
        KEY1,
        "one",
        "JWT",
        json!({"iss":issuer,"sub":"user","aud":"client","exp":exp,"nonce":"nonce"}),
    );
    headers.insert("authorization", format!("Bearer {id}").parse().unwrap());
    assert!(auth::authenticate(&state, &headers, false).await.is_err());
    for (access, nonce) in [
        (good.clone(), "wrong"),
        (
            token(
                KEY1,
                "one",
                "at+jwt",
                json!({"iss":issuer,"sub":"other","aud":"api","exp":exp}),
            ),
            "nonce",
        ),
    ] {
        let req = Request::builder()
            .method("POST")
            .uri("/auth/native/verify")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({"idToken":id,"accessToken":access,"nonce":nonce}).to_string(),
            ))
            .unwrap();
        assert_eq!(
            app(state.clone()).oneshot(req).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
    }
    let request = Request::builder()
        .method("POST")
        .uri("/auth/native/verify")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({"idToken":id,"accessToken":good,"nonce":"nonce"}).to_string(),
        ))
        .unwrap();
    let response = app(state.clone()).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        serde_json::from_slice::<Value>(&to_bytes(response.into_body(), 1024).await.unwrap())
            .unwrap()["subject"],
        "user"
    );
    let response = app(state.clone())
        .oneshot(
            Request::builder()
                .uri("/auth/config")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    rotation.store(1, Ordering::SeqCst);
    headers.insert(
        "authorization",
        format!("Bearer {}", token(KEY2, "two", "at+jwt", claims.clone()))
            .parse()
            .unwrap(),
    );
    assert!(auth::authenticate(&state, &headers, false).await.is_ok());
    server.abort();
    let mut unavailable = state.clone();
    unavailable.auth = AuthState::new(AuthConfig {
        issuer: issuer.clone(),
        client_id: "client".into(),
        resource: "api".into(),
        redirect_uri: "active://callback".into(),
    });
    let err = auth::authenticate(&unavailable, &headers, false)
        .await
        .unwrap_err();
    assert_eq!(err.code, "AUTH_UNAVAILABLE");
}
