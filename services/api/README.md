# Rust API operations

Configure the following environment variables before starting `yarn api:run` (or the release binary). The database parent directory must already exist on a local persistent disk, outside the source and build trees.

| Variable | Meaning |
| --- | --- |
| `ACTIVE_LISTEN` | IP address and port, for example `127.0.0.1:3000` |
| `ACTIVE_DATABASE_PATH` | Absolute SQLite file path, for example `/var/lib/active/active.sqlite3` |
| `ACTIVE_EXTERNAL_URL` | Public HTTPS URL of this service |
| `ACTIVE_TRUSTED_ORIGINS` | Comma-separated HTTPS origins allowed for future web sessions |
| `ACTIVE_OIDC_ISSUER` | Administrator-selected OIDC issuer URL |
| `ACTIVE_BODY_LIMIT_BYTES` | Maximum request body, default 1048576; maximum 16777216 |
| `ACTIVE_REQUEST_TIMEOUT_SECONDS` | Header-read and request-processing deadlines, each default 30 seconds; maximum 300 |
| `ACTIVE_SHUTDOWN_TIMEOUT_SECONDS` | Drain deadline, default 35; maximum 600 |

URLs cannot contain credentials, query strings or fragments. HTTP is accepted only for localhost development. External URL and trusted origins are validated now for future web-session and proxy integration; they do not enable CORS or authentication. Configure TLS at a trusted reverse proxy in production. No administrative or diagnostic routes are exposed.

The process fails startup on invalid configuration, failed storage initialization or a bind error. `/health` reports liveness; `/ready` reports database, auth bootstrap and draining separately. Issuer discovery retries every ten seconds until the configured issuer's metadata is valid; until then readiness is 503 and `/.well-known/active` returns a safe error. Discovery publishes only the frozen public authentication fields and persistent instance UUID. Authentication itself is future work; readiness indicates metadata bootstrap, not functioning user login. Do not expose unfinished domain endpoints as authenticated services.

Each application response receives a generated `X-Request-Id`; transport-level errors can precede request handling and do not receive one. JSON logs include the request ID, method and status, but no request URL, headers or body. Oversized requests receive 413; requests exceeding the processing deadline receive 408. Incomplete headers are closed on the header-read deadline and may receive a transport-level 408. On SIGTERM or Ctrl-C the server becomes unready, stops accepting connections and drains accepted requests until the shutdown deadline. Set the shutdown deadline long enough for the request deadline and any deployment proxy drain window. The UUID lives in SQLite and survives restart and consistent backup/restore.

Requests under `/api` must carry exactly one `X-Active-Contract-Version: 1` header. Missing, duplicate, or unsupported versions receive a structured 426 response before the router processes the request. Discovery and operational endpoints are exempt. The gate does not implement authentication or any domain route.

Run the checks from the repository root:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --workspace --release --locked
```

## SQLite foundation

The storage library opens an absolute database path whose parent already exists, outside the source/build tree. The caller supplies a path on a local persistent disk; WAL is not supported on a network or shared filesystem, and only one API process may use the database. Do not create an empty instance ID or regenerate it on restart or restore.

SQLx runs embedded, ordered migrations before returning a pool. Migration errors fail opening and close the pool. The locked `libsqlite3-sys` 0.30.1 builds bundled SQLite **3.46.0**; do not override it with a system SQLite build. The pool has at most four connections, WAL, foreign keys on every connection, `synchronous=FULL`, and a 500 ms busy timeout. `db::begin_write` acquires `BEGIN IMMEDIATE` before reading versions or receipts and retries busy/locked acquisition at most twice, with a 50 ms delay. On exhaustion, return a retryable service error; retry the entire operation, never only part of a transaction. Commit the mutation and its receipt together, and perform no network calls in a write transaction. A commit is acknowledged only after it succeeds. Keep transactions short; the database does not itself implement HTTP idempotency, version checks, receipt retention, or history reconciliation.

Chronological indexes use `unixepoch(substr(timestamp, 1, 19) || 'Z')` followed by `CASE WHEN length(timestamp) > 20 THEN rtrim(substr(timestamp, 21, length(timestamp) - 21), '0') ELSE '' END`; queries must use those same expressions, then `id` where the contract requires a tie-breaker. This preserves arbitrary RFC 3339 fractional precision and treats trailing zeroes as equal. All stored instants must be validated UTC RFC 3339 strings with uppercase `T` and `Z` and at least one digit after any decimal point; normalize input to that form before writing. The indexed whole-second component is an integer, while the fractional component retains the exact precision. This applies to workout and routine creation order, record chronology, and receipt expiry.

Use canonical lowercase UUID text for generated IDs; external opaque identities and client record IDs are stored as text without reinterpretation. Use UTC RFC 3339 instants with `Z`, ISO dates, IANA timezone names, local `HH:mm` reminder times, kilograms, seconds, and integer reps. API boundaries must validate these representations, finite numbers, ownership, referenced exercise identities, contiguous pattern indices, and matching array lengths. Ordered child rows preserve each array independently. `measurements_present` distinguishes a null measurements object from an object containing null members. Historical records retain labels and identity pairs; `client_record_ids` retains deletion tombstones. Deleting a workout requires the contract's atomic reference transformations before deletion; foreign keys intentionally reject an incomplete transformation.

Back up the database with a supported SQLite snapshot method, not by copying a live main file without its WAL. Keep the database, WAL/SHM sidecars and any future secrets outside source, build and container image artifacts. Restore the entire consistent snapshot, including instance metadata. Backup tooling and upgrade recovery are ALE-131 work.
