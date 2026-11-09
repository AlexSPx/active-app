use std::{env, net::SocketAddr, path::PathBuf, time::Duration};
use url::Url;

#[derive(Clone)]
pub struct Config {
    pub listen: SocketAddr,
    pub database: PathBuf,
    pub external_url: Url,
    pub origins: Vec<Url>,
    pub issuer: Url,
    pub body_limit: usize,
    pub request_timeout: Duration,
    pub shutdown_timeout: Duration,
}

fn required(name: &str) -> Result<String, String> {
    env::var(name)
        .ok()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("{name} is required"))
}

fn safe_url(name: &str, value: &str, origin: bool) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| format!("{name} must be a valid HTTPS URL"))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || url.scheme() == "http" && local)
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || (origin && (url.path() != "/"))
    {
        return Err(format!(
            "{name} must be an HTTPS {} without credentials, query or fragment (HTTP is allowed only on localhost)",
            if origin { "origin" } else { "URL" }
        ));
    }
    Ok(url)
}

fn positive(name: &str, default: u64, max: u64) -> Result<u64, String> {
    match env::var(name) {
        Ok(value) => value
            .parse::<u64>()
            .ok()
            .filter(|n| *n > 0 && *n <= max)
            .ok_or_else(|| format!("{name} must be an integer from 1 to {max}")),
        Err(env::VarError::NotPresent) => Ok(default),
        Err(_) => Err(format!("{name} must be a valid integer")),
    }
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let listen = required("ACTIVE_LISTEN")?
            .parse()
            .map_err(|_| "ACTIVE_LISTEN must be an IP address and port".to_owned())?;
        let database = PathBuf::from(required("ACTIVE_DATABASE_PATH")?);
        if !database.is_absolute() {
            return Err("ACTIVE_DATABASE_PATH must be an absolute path".into());
        }
        let external_url = safe_url(
            "ACTIVE_EXTERNAL_URL",
            &required("ACTIVE_EXTERNAL_URL")?,
            false,
        )?;
        let origins = required("ACTIVE_TRUSTED_ORIGINS")?
            .split(',')
            .map(|v| safe_url("ACTIVE_TRUSTED_ORIGINS", v.trim(), true))
            .collect::<Result<Vec<_>, _>>()?;
        let issuer = safe_url(
            "ACTIVE_OIDC_ISSUER",
            &required("ACTIVE_OIDC_ISSUER")?,
            false,
        )?;
        Ok(Self {
            listen,
            database,
            external_url,
            origins,
            issuer,
            body_limit: positive("ACTIVE_BODY_LIMIT_BYTES", 1_048_576, 16_777_216)? as usize,
            request_timeout: Duration::from_secs(positive(
                "ACTIVE_REQUEST_TIMEOUT_SECONDS",
                30,
                300,
            )?),
            shutdown_timeout: Duration::from_secs(positive(
                "ACTIVE_SHUTDOWN_TIMEOUT_SECONDS",
                35,
                600,
            )?),
        })
    }
}

pub(crate) fn endpoint(value: &str) -> bool {
    safe_url("endpoint", value, false).is_ok()
}

impl Config {
    pub fn auth_config(&self) -> Result<crate::auth::AuthConfig, String> {
        let client_id = required("ACTIVE_OIDC_CLIENT_ID")?;
        let resource = required("ACTIVE_OIDC_RESOURCE")?;
        safe_url("ACTIVE_OIDC_RESOURCE", &resource, false)?;
        let redirect_uri = required("ACTIVE_OIDC_NATIVE_REDIRECT_URI")?;
        let redirect = Url::parse(&redirect_uri)
            .map_err(|_| "ACTIVE_OIDC_NATIVE_REDIRECT_URI must be an absolute URI".to_owned())?;
        if redirect.as_str() != "activenext://auth/callback"
            || redirect.fragment().is_some()
            || !redirect.username().is_empty()
            || redirect.password().is_some()
        {
            return Err(
                "ACTIVE_OIDC_NATIVE_REDIRECT_URI must be activenext://auth/callback".into(),
            );
        }
        Ok(crate::auth::AuthConfig {
            issuer: required("ACTIVE_OIDC_ISSUER")?,
            client_id,
            resource,
            redirect_uri,
        })
    }
}

impl Config {
    pub fn web_auth_config(&self) -> Result<Option<crate::web_auth::WebConfig>, String> {
        let id = env::var("ACTIVE_OIDC_WEB_CLIENT_ID")
            .ok()
            .filter(|s| !s.is_empty());
        let secret = env::var("ACTIVE_OIDC_WEB_CLIENT_SECRET")
            .ok()
            .filter(|s| !s.is_empty());
        match (id, secret) {
            (None, None) => Ok(None),
            (Some(client_id), Some(client_secret)) => Ok(Some(crate::web_auth::WebConfig {
                client_id,
                client_secret,
                external_url: self.external_url.clone(),
            })),
            _ => Err(
                "ACTIVE_OIDC_WEB_CLIENT_ID and ACTIVE_OIDC_WEB_CLIENT_SECRET must both be set"
                    .into(),
            ),
        }
    }
}
