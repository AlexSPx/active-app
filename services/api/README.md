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

## SQLite foundation

The storage library opens an absolute database path whose parent already exists, outside the source/build tree. The caller supplies a path on a local persistent disk; WAL is not supported on a network or shared filesystem, and only one API process may use the database. The current bootstrap binary does not open storage yet; ALE-112 will configure it and initialize the persistent instance ID. Do not create an empty instance ID or regenerate it on restart or restore.

SQLx runs embedded, ordered migrations before returning a pool. Migration errors fail opening and close the pool. The locked `libsqlite3-sys` 0.30.1 builds bundled SQLite **3.46.0**; do not override it with a system SQLite build. The pool has at most four connections, WAL, foreign keys on every connection, `synchronous=FULL`, and a 500 ms busy timeout. `db::begin_write` acquires `BEGIN IMMEDIATE` before reading versions or receipts and retries busy/locked acquisition at most twice, with a 50 ms delay. On exhaustion, return a retryable service error; retry the entire operation, never only part of a transaction. Commit the mutation and its receipt together, and perform no network calls in a write transaction. A commit is acknowledged only after it succeeds. Keep transactions short; the database does not itself implement HTTP idempotency, version checks, receipt retention, or history reconciliation.

Chronological indexes use `unixepoch(substr(timestamp, 1, 19) || 'Z')` followed by `CASE WHEN length(timestamp) > 20 THEN rtrim(substr(timestamp, 21, length(timestamp) - 21), '0') ELSE '' END`; queries must use those same expressions, then `id` where the contract requires a tie-breaker. This preserves arbitrary RFC 3339 fractional precision and treats trailing zeroes as equal. All stored instants must be validated UTC RFC 3339 strings with uppercase `T` and `Z` and at least one digit after any decimal point; normalize input to that form before writing. The indexed whole-second component is an integer, while the fractional component retains the exact precision. This applies to workout and routine creation order, record chronology, and receipt expiry.

Use canonical lowercase UUID text for generated IDs; external opaque identities and client record IDs are stored as text without reinterpretation. Use UTC RFC 3339 instants with `Z`, ISO dates, IANA timezone names, local `HH:mm` reminder times, kilograms, seconds, and integer reps. API boundaries must validate these representations, finite numbers, ownership, referenced exercise identities, contiguous pattern indices, and matching array lengths. Ordered child rows preserve each array independently. `measurements_present` distinguishes a null measurements object from an object containing null members. Historical records retain labels and identity pairs; `client_record_ids` retains deletion tombstones. Deleting a workout requires the contract's atomic reference transformations before deletion; foreign keys intentionally reject an incomplete transformation.

Back up the database with a supported SQLite snapshot method, not by copying a live main file without its WAL. Keep the database, WAL/SHM sidecars and any future secrets outside source, build and container image artifacts. Restore the entire consistent snapshot, including instance metadata. Backup tooling and upgrade recovery are ALE-131 work.
