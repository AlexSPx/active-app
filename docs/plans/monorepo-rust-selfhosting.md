# Monorepo, Rust API, and self-hosting plan

Status: proposal, based on repository inspection on 2026-11-05.

## Agreed scope

- Make this repository the home for the Expo client, Rust server, website, deployment configuration, and supporting tools.
- Ship a server that anyone can install, with a server URL entered in the existing app. Connecting a server remains optional; native training continues to work locally.
- Replace the Java server with Rust and remove WorkOS. Start with new server accounts and a fresh server database. Do not migrate WorkOS accounts, credentials, old server data, or existing server sessions.
- Preserve the user's existing phone data, including training history, templates, routines, profile, preferences, widgets, and any active workout. Connecting an account must not replace it with an empty server profile.
- Use the old server as a behavior reference. Its deployment and authentication architecture are not requirements for the new server.

## Findings that affect the plan

The client at `31311845` uses Expo SDK 58, SQLite, repositories, and a durable SyncEngine. Native accounts, backend access, and sync are currently disabled in `config/launchPolicy.ts`. In that mode, `SyncEngine.enqueue()` returns without inserting jobs. The existing queue is useful infrastructure, but existing local-only data cannot be uploaded just by enabling its processor.

Authentication currently switches between profile databases. Profile owners are keyed by user ID, without a server identity. The API URL is a build-time environment setting in `config/api.ts`. Supporting arbitrary installations requires runtime server configuration and isolation by both server and account.

The Java server's default branch is `1be2c31d907428bf0211ab10c29c23f6d06ddba7`. It implements PostgreSQL storage, idempotent mutations, ownership checks, workout history, personal bests, streaks, and push reminders. User profile reads and updates also call WorkOS for email and names; those fields need an independent home in the new design.

Two open, stacked PRs contain relevant work beyond the default branch:

- [PR 29: reject stale offline writes](https://github.com/AlexSPx/active-service-next/pull/29), head `0c3e07ba82515b6b4c6261d18ebf15987fff1787`, adds entity/profile versions and conflict handling.
- [PR 30: exercise identities and catalog snapshots](https://github.com/AlexSPx/active-service-next/pull/30), head `a3257e778c80a4af3e1afa3ba227786985ee747e`, builds on PR 29 and adds stable source keys, a bundled catalog, and a mapping endpoint.

These are reference implementations to evaluate, not assumed approved or deployed behavior. In particular, the client already has version-aware sync and bundles catalog entries with IDs such as `local:exercise:<sourceKey>`. Those IDs cannot be sent as backend UUIDs.

## Recommended architecture

Use a modular Rust monolith with PostgreSQL, plus a separately packaged self-hosted identity provider. Distribute the whole installation through Docker Compose.

```text
active/
  apps/
    client/                 # Existing Expo app: Android, iOS, and web
    site/                   # Existing static landing site
  services/
    api/                    # Rust application and SQL migrations
  packages/
    api-client/             # Generated TypeScript transport types/client
  contracts/
    openapi.yaml            # HTTP wire contract
  data/
    exercises/              # Pinned source, license, provenance, derived artifacts
  deploy/
    compose.yaml
    compose.dev.yaml
    proxy/
    auth/                   # Provider config/bootstrap; not provider source code
  tools/
    promo/                  # Existing Remotion project
  scripts/
  docs/
  Cargo.toml                # Cargo workspace
  package.json              # JavaScript workspace and root entry points
  yarn.lock
  justfile                  # Commands that coordinate JS, Rust, and containers
```

Keep Yarn initially. Consolidate the promo project's npm lockfile into the workspace after verifying its different React version remains isolated from Expo. A package-manager migration, Nx, and Turborepo are unnecessary prerequisites. Keep shared UI and mobile domain logic inside the client until another application actually consumes them.

Use Axum, Tokio, Serde, SQLx, tracing, and an established OIDC/JWT library. Organize modules around identity, users, exercises, workouts, routines, workout records, achievements/streaks, and optional notifications. Start with one deployable API; add a separate worker only if operations require it. Keep PostgreSQL as the sole server database for the first release.

Use an OpenAPI contract to generate client transport code and check the Rust implementation. Keep SQLite entities, UI models, and runtime validation distinct where their shapes differ. Preserve useful `/api` routes and sync semantics; remove WorkOS-specific endpoints instead of reproducing their implementation.

## Authentication decision

Recommended starting point: **Rauthy, accessed through standard OpenID Connect (OIDC)**. Bundle its configuration with the installation so operators do not have to assemble an authentication system themselves. Its documented capabilities include passwords, passkeys, account self-service, optional registration, and upstream providers. The Rust API should depend on OIDC semantics rather than Rauthy's internal data model.

Before committing to it, complete a small integration spike that proves:

1. Android and iOS sign-in through the system browser, using Authorization Code with PKCE and the app's `activenext` callback scheme; cancellation and expired callbacks recover cleanly.
2. Account creation, invitation, passkey enrollment, recovery, refresh rotation, and logout work with the selected provider version.
3. A private installation can bootstrap its administrator and has a documented recovery procedure. Establish which flows require SMTP and what works without it; do not silently require a hosted email service.
4. The exported access token has the intended API audience and can be validated correctly by the Rust server.
5. Provider setup, upgrades, and restores are manageable from the Compose distribution.

Alternatives: [Pocket ID](https://pocket-id.org/docs/introduction) suits installations that deliberately want passwordless/passkey authentication. Its narrower enrollment and recovery experience should be an explicit product choice. [Keycloak](https://www.keycloak.org/guides) is the fallback when broader identity administration is required. Avoid implementing password storage, password-reset flows, or an OAuth authorization server inside the workout API.

The authentication contract should be:

- Native: public OIDC client, system browser, PKCE S256, validated state/nonce, no client secret in the app, and refresh credentials in SecureStore. Request only the required scopes.
- Web: same-origin Rust auth endpoints perform the browser login flow and maintain an opaque server session in a Secure, HttpOnly cookie, with CSRF protection and appropriate SameSite policy. Do not put refresh tokens in browser storage. The API can serve the existing static Expo web export behind the proxy.
- API: verify issuer, signature, audience, expiry, and permitted algorithms; cache discovery/JWKS with bounded refresh. Reject ID tokens as API access credentials. Account identity is `(issuer, subject)`, mapped to an internal user UUID. Every domain query enforces that UUID's ownership.
- Deployment: ship working provider configuration, separate native/web OIDC clients, exact redirect registrations, and safe bootstrap. Invite-only registration is the default; public registration is an operator setting.
- Existing OIDC providers can be supported through configuration after the bundled path works. Do not make several providers part of the first implementation.

Creating an identity at the provider and creating an application user are separate operations: the API provisions the application user idempotently after a verified login. Application profile fields live in Active's database and initially come from the phone; provider claims must not overwrite an existing training profile.

## Phone data and first connection

The intended experience is: **Settings → Connect server → enter URL → create an account or sign in → bring this phone's data → sync**. Continuing without a server remains available.

Add a public instance metadata endpoint containing a persistent instance UUID, API compatibility version, supported capabilities, public auth configuration, and registration policy. Configure the trusted issuer on the server; do not accept arbitrary issuers supplied with requests. Use HTTPS outside explicit local development. A single distributed app build must connect to different installations without rebuilding.

Scope credentials, databases, cached queries, queue jobs, and settings by `(instance UUID, application user UUID)`. A server URL is an address, not the account identity. A URL change must never send existing credentials or jobs to another instance. A restored instance retains its UUID; separate installations receive different UUIDs.

Build a resumable first-connection operation:

1. Preserve a recoverable snapshot of the local profile. Quiesce database/profile transitions and handle an active workout without losing or changing its state.
2. Authenticate and provision the application account. Read the target account before any remote hydration. An empty remote account must not overwrite local profile fields or local training data.
3. Journal the local-to-account profile promotion. Reuse local data and IDs in a server-scoped profile, including persisted settings and widget/session references. Keep the source recoverable until completion; use explicit stages because filesystem, SQLite, and credential storage do not share one transaction.
4. Build queue jobs from the current local state. Do not assume a historical queue exists, and do not replay stale jobs from an old server/account. Use a persisted import identifier and stable operation keys so a restart does not create a second import.
5. Resolve exercise source keys to this installation's UUIDs through the complete catalog mapping. Cached UUIDs from another server are not portable. Preserve unresolved entries locally and report actionable resolution; never guess by exercise name. Support history snapshots for exercises or workouts that no longer exist.
6. Upload in dependency order: profile and workouts/templates, then routines and records as their references become available, then active-routine state. Reuse existing ID remapping and durable retries; preserve original workout dates. Importing history must not send a burst of reminders or award current-day streak credit.
7. Persist acknowledgements and mapping checkpoints, verify the imported entities, and then enable normal hydration and ongoing sync. Resume safely after network loss, process death, token expiry, or partial success.

The first release supports one connected server/account at a time. A later server/account switch must be explicit and must not silently upload the previous profile. Signing into a nonempty account must offer a clear choice about importing this phone's data; until a merge policy exists, preserve the local snapshot and keep both datasets separate.

## Delivery sequence

### 1. Freeze the contract and prove auth

Inventory the routes, DTOs, error bodies, transactions, and domain rules against both the Java default branch and PRs 29/30. Select the behavior needed by the current client, including versioned acknowledgements and catalog mapping. Capture fixtures for representative requests, responses, dates, enum values, and nullable fields. Finish the Rauthy spike and record the provider choice.

**Done when:** the first-connection flow and auth choice are documented, and the wire contract covers every sync operation the client will use. No WorkOS migration work is required.

### 2. Convert the repository to workspaces

Move the existing app to `apps/client`, landing site to `apps/site`, and promo tooling to `tools/promo`. Preserve Git history for these moves. Update Metro/Uniwind, TypeScript/Jest paths, Expo config/assets/plugins, Maestro/scripts, EAS working directories and packaging, Pages paths, and legal-content generation. Preserve app identifiers, callback scheme, EAS project identity, update channels, and runtime settings.

Keep this a structural change. Add root commands for client development, backend development, checks, and Compose. Move shared exercise artifacts and legal-content sources in a follow-up within this phase, preserving their provenance and generated outputs.

**Done when:** Android/iOS builds, Expo web export, existing client checks, Pages verification, legal checks, and promo dependency resolution work from the new layout.

### 3. Establish Rust, identity, and fresh storage

Create the Cargo workspace, API container, fresh SQLx migrations, health/readiness endpoints, structured logs, configuration, OpenAPI checks, and local Compose dependencies. Add instance identity/discovery and application-user provisioning. Complete native login and web sessions. Store user profile fields in Active rather than retrieving them from WorkOS.

Use fresh migrations derived from the desired schema; there is no need to translate Flyway metadata or preserve legacy server rows. Remove WorkOS UI, callbacks, repository methods, configuration, documentation, and unused Google sign-in paths once the replacement is connected. Optional social login can later be configured upstream of OIDC.

**Done when:** a fresh installation can create an account, authenticate on mobile/web, read its profile, refresh/sign out, and reject cross-account access without any WorkOS calls.

### 4. Implement the sync API

Port the pinned exercise catalog and mapping endpoint, workout/template mutations, routines, and workout records. Make these requirements part of the initial implementation:

- Owner-scoped authorization on resources and references.
- A durable idempotency receipt committed in the same transaction as its mutation; exact replay returns the original result and mismatched key reuse conflicts. Concurrent retries cannot create duplicate records.
- Entity/profile versions, stale-write rejection, and delete acknowledgements compatible with the selected contract.
- Transactions around record insertion and personal-best/streak updates; preservation of history when templates are deleted.
- Stable exercise identity, ordered sets/patterns, correct null semantics, and timezone-aware dates.

Port personal-best and streak calculations with representative Java behavior fixtures, correcting any behavior explicitly rejected during contract review. Keep server push behind a disabled-by-default setting. Device-local notifications remain usable without remote services.

**Done when:** real PostgreSQL integration checks and the client sync scenarios pass, including retries, concurrency, deletion, stale writes, ownership violations, and catalog mapping.

### 5. Connect existing phone profiles

Implement runtime server selection, instance/account scoping, profile promotion, queue bootstrapping, and recovery described above. Replace the fixed native launch flags with explicit local-only and connected states. Auth expiry pauses remote synchronization while training remains available offline.

**Done when:** a populated phone can create a new server account, upload once, restart during import, and recover without losing or duplicating data. A second device can read the imported data. A failed login, logout, outage, app upgrade, or server switch cannot erase or leak the original local profile.

### 6. Package and document the self-hosted release

Ship versioned images for supported architectures, a pinned Compose stack, proxy/TLS examples, persistent volumes, health checks, bootstrap commands, and upgrade instructions. The default stack consists of the API, PostgreSQL, bundled auth, and a reverse proxy. Keep API and auth databases/users separate even if they share one PostgreSQL service.

Document domain/DNS and TLS requirements, native callback setup, account enrollment/recovery, registration controls, SMTP requirements, and optional push. Do not expose PostgreSQL, metrics, test endpoints, or administrative bootstrap endpoints publicly. Bundle the exercise dataset so booting and training do not require a runtime GitHub download.

Add backups and a tested restore procedure for application data, instance identity, auth data, and required encryption/signing material. Support export of local data before connection. Record compatibility between released apps and server versions; incompatible servers must produce a useful message rather than corrupting queues.

**Done when:** someone following the documentation can install on a clean machine, connect the released app, register, upload an existing local profile, sync another device, upgrade, and restore from backup.

## Release boundaries

The first vertical slice is: **fresh Compose installation → create account → connect an existing phone → upload one local workout → retrieve it on a second device**. Prove that path before completing the whole Java feature inventory.

The first self-hosted release includes local-only use, runtime server selection, account enrollment/recovery, safe first upload, core training/history/routine sync, and backup/restore. Server push reminders may follow; remote push continues to depend on Expo/APNs/FCM and is not required for core self-hosting. EAS builds/OTA, app stores, SMTP, and optional social providers should be documented separately from runtime server requirements.

Defer multi-server dashboards, automatic cross-server migration, SQLite as a server database, Kubernetes, microservices, custom password authentication, billing, and enterprise identity features. The Java repository can remain a pinned reference until the port is verified; importing or operating a legacy Java service inside the monorepo is unnecessary.

## Verification and remaining uncertainty

This is a source-inspected implementation plan, not a completed migration. No live server database or phone was accessed, and no application tests or provider integration spike were run. The selected Rauthy version, SMTP/recovery behavior, native redirect compatibility, actual device data shapes, and hardware support must be verified during the indicated phases.

Sources: [Java server](https://github.com/AlexSPx/active-service-next), [versioned sync PR](https://github.com/AlexSPx/active-service-next/pull/29), [catalog PR](https://github.com/AlexSPx/active-service-next/pull/30), [Rauthy capabilities](https://github.com/sebadob/rauthy), [Pocket ID introduction](https://pocket-id.org/docs/introduction), and [Keycloak guides](https://www.keycloak.org/guides). Pocket ID's fetched introduction labels itself unreleased documentation; verify features against the selected release before adopting it.
