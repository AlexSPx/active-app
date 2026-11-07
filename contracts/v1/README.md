# Active API contract, version 1

This directory defines the release wire contract for an Active server and its clients. The [wire contract](wire-contract.md) describes the binding behavior, including authentication, versioning, retries, history, and migration requirements.

Active JSON uses camelCase and UTF-8. Required response fields are present even when null; omitted optional update fields mean unchanged, while explicit null clears a nullable field. IDs are opaque and instance-scoped. Authenticated resources and references are owner-scoped. Active requests carry `X-Active-Contract-Version: 1` except discovery, and mutations require an idempotency key and the applicable versions. See the wire contract for the full rules and exceptions.

## Artifacts

- [release-operations.json](release-operations.json) indexes the operations and illustrative success and error examples. Paths are relative to the discovered instance except OIDC provider routes. GET and DELETE use path and query parameters rather than a body; `queue` describes existing SyncEngine arguments, which may differ from the HTTP body.
- [request-contract.cjs](request-contract.cjs) is the authoritative executable Zod schema for Active request bodies, decoded path parameters, and decoded query parameters.
- [response-contract.cjs](response-contract.cjs) is the authoritative executable Zod schema for Active response bodies.
- [openapi.json](openapi.json) and the API client are generated from the executable schemas and operation index.
- [client-parser-observations.json](client-parser-observations.json) records examples used to check the current client parsers; it is not a complete response schema.

Legal examples represent the response as `{content, contentType}` in the index; the wire body is raw Markdown with `Content-Type: text/markdown; charset=utf-8`. OIDC examples describe provider protocol responses, and a redirect's `location` is its Location header, with no JSON body.

## Verification

From the repository root, run the contract and parser checks:

```sh
yarn workspace active-next jest tests/sync/rustReleaseContract.test.js tests/sync/rustContractObservations.test.js --runInBand
```

These checks validate the fixtures and document current parser behavior; they do not establish that the current client can consume every version 1 response. See the [migration boundaries](../../docs/architecture/rust-contract-boundaries.md) and [source inventory](../../docs/architecture/rust-contract-source-inventory.md) for context.

## Generation and validation

The request and response Zod contracts are the wire authority. Run `yarn contract:generate` after changing them or the operation index; it writes OpenAPI 3.1, transport types, operation metadata and the runtime schemas in `packages/api-client`. Run `yarn contract:check` to reject stale artifacts and validate examples and actual Rust discovery and error responses, including invalid negative controls. Run `yarn contract:typecheck` for the client. CI runs all three checks. OpenAPI describes structural constraints; cross-field refinements and ordering rules remain in the executable schemas and wire contract.

The transport validates outgoing requests and incoming success/error bodies. It exposes explicit bearer, same-origin session and unauthenticated modes; callers supply session CSRF and mutation idempotency keys. It reports incompatible server responses through the structured `ApiError`. OIDC provider operations are outside the Active API contract and legal responses are Markdown rather than JSON.
