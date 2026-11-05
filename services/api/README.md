# Rust API bootstrap

Install [Rust via rustup](https://rustup.rs/). From the repository root, run:

```sh
yarn api:run
curl http://127.0.0.1:3000/health
```

The response is `{"status":"ok"}`. This bootstrap requires no Java, PostgreSQL, or Redis. The pinned toolchain and Cargo dependencies are downloaded on the first build. The health route is a liveness check; storage and the versioned API described in `contracts/v1` are not implemented yet.

`yarn api:check` and `yarn api:test` run the workspace checks and tests. CI also runs:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --workspace --release --locked
```

For an initial development container, build from the repository root with `docker build -f services/api/Dockerfile -t active-api-dev .` and run `docker run --rm --network host active-api-dev` on Linux. The server currently binds to loopback, so this host-network option is needed to reach it outside the container. Configuration and container-friendly binding are follow-on work.
