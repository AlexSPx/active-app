# Disposable Pocket ID protocol probe

This is a local-only investigation, not production configuration, an Active session implementation, or evidence of a native callback. It uses a new provider database and never touches Expo storage. Docker Compose and Node 20 or newer are required. From this directory:

```sh
export POCKET_ID_PROOF_KEY="$(openssl rand -base64 32)"
docker compose up -d
curl -fsS http://localhost:1411/.well-known/openid-configuration
```

Visit <http://localhost:1411/setup> immediately and create the initial administrator. Add a passkey before its session expires. The HTTP listener is bound to loopback only; WebAuthn origin and issuer must match the configured URL. A native device needs a reachable HTTPS origin. Never use this key, volume or accounts in production.

In Administration, create a **public** OIDC client with callback `http://localhost:1412/callback` and, for later native testing, `activenext://auth/callback`. There is no client secret. In its Access tab select All Users for this disposable instance (new clients may be group-restricted with no groups). Create an API with resource `https://active.example.test/api` and grant the public client user-delegated access. Do not use a wildcard callback.

```sh
export POCKET_ID_CLIENT_ID='<the public client ID>'
node proof.cjs
```

In the browser already signed in to Pocket ID, open <http://localhost:1412/> and approve the requested access. The probe exchanges the code server-side, verifies RS256 signatures, issuer, expiration, ID audience/nonce and API audience/`at+jwt` type, checks that the ID token fails the API audience, refreshes, attempts immediate refresh-token and authorization-code replay, and calls end-session then checks refresh failure. It reports outcomes without printing tokens. Restart the probe for each run. Its HTTP callback, in-memory state and lack of real app sessions are deliberately limited to this single-user local experiment. Browser history and provider access logs can contain the authorization code. Treat the database, logs, URLs and one-time links as credentials and discard them after the experiment.

Repeat with `POCKET_ID_PROOF_CASE=bad-verifier node proof.cjs` to check provider rejection of a wrong PKCE verifier, or `POCKET_ID_PROOF_CASE=bad-nonce node proof.cjs` to check the probe's nonce comparison. To exercise state handling, start the normal probe, request `/` without following its redirect, then request `/callback?code=not-a-code&state=wrong&iss=http%3A%2F%2Flocalhost%3A1411`; it must return 400. A new request to `/` starts a fresh attempt after failure. These probes do not test an app's own state, nonce or cancellation handling.

To exercise operator recovery after creating a user, run `docker compose exec pocket-id /app/pocket-id one-time-access-token USERNAME`. Open the resulting single-use link privately and add a new passkey. SMTP is required for emailed recovery; the operator-assisted path does not use SMTP. Stop and erase **only this disposable volume** with `docker compose down -v`. See the [investigation](../../docs/architecture/oidc-provider-investigation.md) for the remaining acceptance gates and backup requirements.
