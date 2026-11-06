use active_api::{config::Config, db};
use hyper::server::conn::http1;
use hyper_util::{
    rt::{TokioIo, TokioTimer},
    server::graceful::GracefulShutdown,
    service::TowerToHyperService,
};
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
    let server = serve(
        listener,
        active_api::app(state.clone()),
        config.request_timeout,
        shutdown_rx,
    );
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

async fn serve(
    listener: tokio::net::TcpListener,
    app: axum::Router,
    header_timeout: Duration,
    mut shutdown: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), std::io::Error> {
    let graceful = GracefulShutdown::new();
    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            accepted = listener.accept() => {
                let (stream, _) = match accepted {
                    Ok(connection) => connection,
                    Err(_) => {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        continue;
                    }
                };
                let service = TowerToHyperService::new(app.clone());
                let watcher = graceful.watcher();
                tokio::spawn(async move {
                    let mut builder = http1::Builder::new();
                    builder.timer(TokioTimer::new()).header_read_timeout(header_timeout);
                    let connection = builder.serve_connection(TokioIo::new(stream), service);
                    let _ = watcher.watch(connection).await;
                });
            }
        }
    }
    drop(listener);
    graceful.shutdown().await;
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

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn incomplete_headers_time_out_and_server_remains_available() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let app = axum::Router::new().route("/health", axum::routing::get(|| async { "ok" }));
        let server = tokio::spawn(serve(listener, app, Duration::from_secs(1), shutdown_rx));

        let mut slow = tokio::net::TcpStream::connect(address).await.unwrap();
        slow.write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\n")
            .await
            .unwrap();
        let mut response = Vec::new();
        tokio::time::timeout(Duration::from_secs(3), slow.read_to_end(&mut response))
            .await
            .expect("incomplete headers must time out")
            .unwrap();
        assert!(!response.starts_with(b"HTTP/1.1 200"));
        let _ = slow.write_all(b"\r\n").await;

        let mut normal = tokio::net::TcpStream::connect(address).await.unwrap();
        normal
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut response = Vec::new();
        normal.read_to_end(&mut response).await.unwrap();
        assert!(response.starts_with(b"HTTP/1.1 200"));
        shutdown_tx.send(()).unwrap();
        server.await.unwrap().unwrap();
    }
}
