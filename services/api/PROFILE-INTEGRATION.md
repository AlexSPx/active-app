# Profile integration status

The profile and reminder-preference endpoints return `401 UNAUTHENTICATED` until the authentication and mutation infrastructure is implemented. OIDC discovery is not authentication: this checkout has no access-token validation or server-side session lifecycle. `VerifiedPrincipal` is a trusted internal handoff, not a request DTO. Never construct it from client-supplied identity headers or unverified claims.

The authentication layer must validate the configured issuer, Active API audience, access-token type, expiry and signature or authenticated introspection; web sessions must be securely bound to the same issuer and subject and enforce CSRF and Origin checks for mutations. It must supply the verified `(issuer, subject)` and a verified email for first provisioning, call `profile::provision`, and use the returned internal UUID as the sole owner for subsequent operations. Do not accept an owner ID from the request. Already-provisioned identities do not require a new email claim.

Before exposing PATCH, PUT or DELETE, implement the contract's atomic idempotency-key handling with the domain mutation in the same SQLite transaction. The current domain functions own their transactions and are not yet suitable for such a wrapper; refactor them to accept a shared transaction. In particular, account deletion cascades existing receipts, so a durable, privacy-preserving deletion retry design is needed to replay its acknowledgement without leaving the deleted user's data or re-provisioning the account. Do not enable mutation routes until these requirements are reconciled. GET can be wired after authentication and owner provisioning are complete. The current closed routes do not claim full wire behavior.

Deleting an account removes its Active-owned SQLite rows, including identities, sessions and receipts, through foreign-key cascades in one transaction. It makes no call to the identity provider and cannot delete device-local data. A subsequent verified login can create a new Active account.

## Client handoff

`apps/client/lib/repositories/accountProfileV1.ts` prepares serializable initialization and deletion plans. Preparation validates the profile and preference payloads before dispatch. Initialization copies the populated device snapshot into an unchanged newly provisioned profile; it does not overwrite an existing profile or existing preferences.

The future authenticated connection flow must capture the device snapshot before switching profiles, obtain the remote profile and preference state, and require an explicit user action. Persist the initial plan before dispatch and every returned initialization checkpoint before executing the next stage. After response loss, replay the last persisted stage with exactly the same payload and idempotency key. Deletion preparation checks the account and version once; execution retries DELETE directly without a GET that could re-provision the deleted identity.

The caller must bind persisted plans and the authenticated client to the same instance UUID and account UUID, fence account/server switches and in-flight responses, and validate restored storage before execution. After confirmed remote deletion, invalidate the Active session separately and preserve the local profile unless the user explicitly requests device erasure. These helpers are not connected to the legacy auth/deletion UI and do not implement plan storage or session cleanup. End-to-end retry guarantees require the server receipt integration described above.

This change is a foundation for ALE-117, not completion of its HTTP or populated-phone acceptance criteria. ALE-116 authentication and the atomic receipt integration remain release blockers.
