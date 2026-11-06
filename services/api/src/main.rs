use active_api::{config::Config, db};
use std::time::Duration;
use tracing_subscriber::{filter::filter_fn, prelude::*};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_filter(filter_fn(|metadata| {
                    metadata.target().starts_with("active_api")
                })),
        )
        .init();
    if let Err(message) = run().await {
        eprintln!("{message}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let config = Config::from_env()?;
    let pool = db::open(&config.database).await.map_err(|_| {
        "SQLite initialization failed; check ACTIVE_DATABASE_PATH, permissions, and migrations"
            .to_owned()
    })?;
    let state = active_api::initialize(pool, &config)
        .await
        .map_err(|_| "SQLite instance identity initialization failed".to_owned())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "OIDC client initialization failed".to_owned())?;
    let auth_state = state.clone();
    let issuer = config.issuer.clone();
    let auth_task = tokio::spawn(async move {
        loop {
            match active_api::bootstrap_auth(&auth_state, &issuer, &client).await {
                Ok(()) => {
                    tracing::info!("OIDC bootstrap complete");
                    break;
                }
                Err(reason) => tracing::warn!(reason, "OIDC bootstrap failed; retrying"),
            }
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    });
    let listener = tokio::net::TcpListener::bind(config.listen)
        .await
        .map_err(|_| "ACTIVE_LISTEN could not be bound".to_owned())?;
    tracing::info!(address = %listener.local_addr().map_err(|_| "listener address unavailable")?, "API listening");
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server =
        axum::serve(listener, active_api::app(state.clone())).with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        });
    let server = std::future::IntoFuture::into_future(server);
    tokio::pin!(server);
    tokio::select! {
        result = &mut server => result.map_err(|_| "HTTP server failed".to_owned())?,
        _ = shutdown_signal() => {
            active_api::start_draining(&state);
            tracing::info!("shutdown started");
            let _ = shutdown_tx.send(());
            match tokio::time::timeout(config.shutdown_timeout, &mut server).await {
                Ok(result) => result.map_err(|_| "HTTP server failed".to_owned())?,
                Err(_) => tracing::warn!("shutdown deadline reached"),
            }
        }
    }
    auth_task.abort();
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
