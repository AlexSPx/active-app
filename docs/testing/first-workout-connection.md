# First account connection: one workout

On a populated native device, Settings → Self-hosted account offers “Sign in and attach one workout”. It captures the current device profile, preferences and most recently created non-deleted workout before sign-in. After authentication, the app saves that snapshot and an import ID and operation key in the device profile's SQLite database, bound to the server instance and account. It seeds the new account's local profile only if that profile does not already exist, then switches profiles. Choosing ordinary sign-in leaves the device profile separate. Disconnecting returns to it.

Select “Resume workout upload” after connecting. The app initializes only a fresh server profile and absent preferences using the existing durable profile plan. It resolves the workout's exercise IDs against the server catalog, persists the resolved request before sending it, and reuses the same operation key on every retry. It retains the server workout ID and version after acknowledgement. An unresolved exercise or a network or sign-in failure leaves the source and the pending request in place. Sign in to the same instance and account and select Resume again. A different account cannot resume that job. “Read server workouts” retrieves the account's workout list on another connected client.

The attachment is a fixed snapshot: edits made to the original after capture are not uploaded by this slice. The source profile, settings, active session, workout and history remain in their original local profile. The import record remains there for retries and mapping; it is removed with device-data erasure. Only one workout is attached per instance/account by this flow. Full profile reconciliation, remaining workouts, routines, history, ongoing sync and conflict handling are ALE-128 work. The legacy background sync transport remains disabled.

## Reproducible cross-layer proof

Install the workspace dependencies and Rust toolchain, then run from the repository root:

```sh
ACTIVE_FIRST_WORKOUT_PROOF=1 cargo test --locked -p active-api --test profile_http first_workout_client_sqlite_http_proof -- --nocapture
```

This opt-in fixture starts the real Rust HTTP routes with a disposable test OIDC issuer and an on-disk server database. Separate Node client processes use the production contract client and import functions with another on-disk SQLite database. They stop after preparing the request, drop the response after the server commits, replay after restart, roll back an acknowledgement, replay again and read the result using a second client. The fixture checks that the server has one workout and that source workout and history remain intact. It does not exercise Pocket ID enrollment, a native app build or a physical device.
