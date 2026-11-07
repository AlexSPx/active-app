# Disposable Pocket ID proofs

These local-only experiments are not production configuration or an Active session implementation. They use new databases and never read or alter Active phone data. Node 20+, a browser and either Docker Compose or the released binary are required. Run commands from this directory unless stated otherwise.

## Start the released binary without Docker

This is the path actually used for the recorded host evidence. It downloads an upstream release and checks its SHA-256 against the release's checksum file (not a signature verification):

```sh
mkdir -p /tmp/active-oidc-proof
cd /tmp/active-oidc-proof
gh release download v2.19.2 --repo pocket-id/pocket-id \
  --pattern pocket-id_linux_amd64 --pattern checksums.txt
sha256sum -c --ignore-missing checksums.txt
chmod +x pocket-id_linux_amd64
export APP_URL=http://localhost:1411
export ENCRYPTION_KEY="$(openssl rand -base64 32)"
export ANALYTICS_DISABLED=true VERSION_CHECK_DISABLED=true HOST=127.0.0.1
./pocket-id_linux_amd64
```

Keep the random key for the lifetime of this disposable database and its backups. In another terminal run `curl -fsS http://localhost:1411/.well-known/openid-configuration`. Alternatively, from this directory set `POCKET_ID_PROOF_KEY` to a random key and run `docker compose up -d`. The Compose listener is loopback only; erase **only its disposable volume** using `docker compose down -v`.

Visit <http://localhost:1411/setup> immediately, create the first administrator, and add a passkey before its session expires. HTTP is only for localhost; production and native tests need a stable reachable HTTPS issuer and a matching WebAuthn origin. Treat the data directory, key, logs, URLs and one-time links as credentials. Provider logs and browser history may contain authorization codes. Do not reuse this data or test credentials for production.

## Public client protocol probe

In Administration, create a **public** OIDC client with callback `http://localhost:1412/callback` and `activenext://auth/callback`. In its Access tab choose All Users for this disposable instance (a new client can otherwise be group-restricted with no groups). Create an API resource `https://active.example.test/api` and grant the client user-delegated access. Do not use wildcard redirects.

```sh
export POCKET_ID_CLIENT_ID='<public client ID>'
POCKET_ID_PROOF_CASE=code-replay node proof.cjs
```

Open <http://localhost:1412/> in a browser already signed in to Pocket ID and approve consent. Restart with `POCKET_ID_PROOF_CASE=refresh-logout` for a fresh grant and with `POCKET_ID_PROOF_CASE=refresh-reuse` for another fresh grant; the last case waits 65 seconds. Separating grants matters because authorization-code replay can revoke the token family. Each case checks signatures, issuer, token type, audience, ID-token nonce and subject. The code-replay case requires `invalid_grant` immediately after exchange. The refresh-logout case proves the rotated refresh token works, then requires `invalid_grant` after logout. The reuse case checks immediate retry and reuse after grace.

`bad-verifier` and `bad-nonce` are additional cases. For state handling, start the normal probe, request `/` without following its redirect, then request `/callback?code=not-a-code&state=wrong&iss=http%3A%2F%2Flocalhost%3A1411`; it must return 400. A new request to `/` starts a fresh attempt after failure. These probes do not test an app's own state, nonce or cancellation handling.

## Confidential web session probe

Create a **separate confidential** client, callback `http://localhost:1413/callback`, grant it user-delegated access to the same API, and allow the test user. Keep its secret on the host only:

```sh
export POCKET_ID_WEB_CLIENT_ID='<confidential client ID>'
read -rs POCKET_ID_WEB_CLIENT_SECRET
export POCKET_ID_WEB_CLIENT_SECRET
node web.cjs
```

Open <http://localhost:1413/login>, authorize, then open `/`. The server requires a verified email and keeps tokens server-side. It uses a random HttpOnly, SameSite=Lax session cookie, PKCE, state and nonce; the local HTTP cookie cannot be Secure. `/refresh` and `/logout` require POST, the displayed CSRF token in `X-CSRF-Token`, and same-origin `Origin`. A real HTTPS web implementation must use Secure cookies, durable session management, expiration and the contract's CSRF/Origin rules; this in-memory, single-process probe is not deployable. Do not enable automatic trust of unverified addresses for real accounts.

## Native proof

In `native/`, run `npm ci`, then build and install a development client for the target using `npx expo run:android` or `npx expo run:ios`; start it with `npm start`. A development build is needed for the exact registered scheme; Expo Go is not evidence of that callback. Register the public client's exact `activenext://auth/callback`. Enter the HTTPS issuer, public client ID and API resource in the app; no client secret is used. Sign in via system browser, test cancellation/retry, refresh and sign-out. Tokens are only in memory. This separate proof app has distinct bundle IDs and does not touch the installed Active app. `npm run` builds do not prove device behavior; see the investigation for missing checks.

## Recovery, snapshot and upgrade rehearsal

An operator can run `./pocket-id_linux_amd64 one-time-access-token USERNAME` from the binary's data directory with the original environment, or `docker compose exec pocket-id /app/pocket-id one-time-access-token USERNAME`. Open the resulting single-use link privately and register a replacement passkey. SMTP is needed for emailed recovery and verification; the operator-assisted link does not require it.

For a **disposable direct-binary** stopped instance in `/tmp/active-oidc-proof`, with its original `APP_URL` and `ENCRYPTION_KEY` still set:

```sh
cd /tmp/active-oidc-proof
# Stop the server cleanly first; never copy a live main SQLite file alone.
mkdir -p /tmp/active-oidc-backup /tmp/active-oidc-restore
cp -a data /tmp/active-oidc-backup/data
./pocket-id_linux_amd64 export --path /tmp/active-oidc-backup/export.zip
cp -a /tmp/active-oidc-backup/data /tmp/active-oidc-restore/data
cd /tmp/active-oidc-restore
/tmp/active-oidc-proof/pocket-id_linux_amd64
```

Run only one instance at a time on this port and inspect discovery, accounts, client registrations, signing keys and an actual passkey login after restore. For upgrade rehearsal, download and checksum the target release, stop the restored instance, keep an untouched backup, and start the new binary against **that restored copy** with the same issuer and key. Confirm login, recovery and database integrity. Revert by restoring the untouched old-version backup, not by assuming a migrated database supports downgrade. Never copy this example's locations over real data. Store production backups and encryption keys separately and securely; verify restore and upgrade with real passkeys before relying on them.
