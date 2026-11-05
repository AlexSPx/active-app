# Rust contract source inventory

This inventory records the source evidence. The release wire contract and fixtures are in [contracts/v1](../../contracts/v1/README.md).

## References

- Client monorepo master: `a42b30f10f5dbadc0d567995599b82ae9f5c004a`.
- Java master: `1be2c31d907428bf0211ab10c29c23f6d06ddba7`.
- Java [PR 29](https://github.com/AlexSPx/active-service-next/pull/29): `0c3e07ba82515b6b4c6261d18ebf15987fff1787`.
- Java [PR 30](https://github.com/AlexSPx/active-service-next/pull/30): `a3257e778c80a4af3e1afa3ba227786985ee747e`.

The PR heads are behavior references, not claims of approval or deployment. PR 30 builds on PR 29. The older `docs/plans/monorepo-rust-selfhosting.md` proposes PostgreSQL and server streak computation; ALE-109 supersedes those recommendations with SQLite and client-owned streaks.

## Client and Java operation inventory

The client routes are in `apps/client/config/api.ts`; transport methods are in `apps/client/services/apiService.ts`. Response parsers are in `apps/client/lib/schemas/api.ts`, request types in `apps/client/types/api.ts` and `apps/client/types/routine.ts`, and queue methods in `apps/client/lib/sync/api.ts` and `SyncEngine.ts`.

| Area                      | Existing operations                                                                                | Rust boundary                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile                   | `GET`, `PATCH`, `DELETE /api/user/me`                                                              | Retain profile and account deletion, with Active-owned data and owner checks.                                                                           |
| Legal                     | `GET /api/legal/terms-of-service`, `GET /api/legal/privacy-policy`                                 | Client also bundles legal content in `features/legal/legalContent.ts`; decide the release source and endpoint behavior.                                 |
| Catalog and progression   | `GET /api/exercises/search?name=...`, `GET /api/exercises/{id}/logs`                               | Retain search and progression reads; add complete source-key mapping. PR 30 adds `GET /api/exercises/catalog`.                                          |
| Workouts and templates    | `GET`, `POST /api/workouts`; `PUT`, `DELETE /api/workouts/{id}`                                    | Retain ordered templates and owner-scoped mutations. Versioned delete returns affected routine versions.                                                |
| Routines                  | `GET`, `POST /api/routines`; `GET`, `PUT`, `DELETE /api/routines/{id}`; `GET /api/routines/active` | Retain patterns and active routine. Versioned deletion returns profile version when affected.                                                           |
| History                   | `GET`, `POST /api/workouts/record`; `DELETE /api/workouts/record/{id}`                             | Retain history and personal-best handling. Preserve original completion chronology. Do not calculate streaks on the server.                             |
| Authentication            | WorkOS callback, refresh and logout on Java; legacy signup, login and Google methods in the client | Replace with selected self-hosted OIDC. Do not migrate credentials or accounts.                                                                         |
| Notifications and streaks | Java push-token registration, notification test routes and server streak logic                     | Remove from the Rust server. Persist versioned client-computed streak snapshots and reminder preferences; scheduling and delivery remain on the device. |

Fresh server storage has no Java data migration or Flyway history. Existing phone data must remain recoverable during connection. The server enforces ownership on resources and references. Server instance identity and account identity scope credentials, jobs and cached data.

## Observed compatibility gaps

- `workoutRecordResponseSchema` requires a `streakUpdate`. The approved Rust boundary removes server streak computation. A client parser and sync transition are required before using a different response.
- `WorkoutRecordRequest.startTime` is documented as a local date-time without a timezone. It has no completion timestamp or original completion timezone. Historical import needs an explicit representation before chronology can be preserved across devices.
- Workout, routine and profile versions are optional in the current client types and schemas. PR 29 adds versions and `baseVersion`, with `409` and `code: STALE_VERSION`; `currentVersion` can be absent. The Rust contract must specify required versions and conflict behavior, and update callers accordingly.
- `WorkoutDeleteAck` contains `deletedWorkoutId` and `routineVersions`; `RoutineDeleteAck` contains `deletedRoutineId` and an optional `profileVersion`. Delete versions are query parameters in `apiService.ts`. Existing callers also accept unversioned deletes and empty acknowledgements, which must be addressed for a strict versioned protocol.
- PR 30's catalog returns a full snapshot with `catalogVersion`, `sourceDatasetVersion`, mapping readiness fields and items containing `sourceKey`, `retired` and nullable metadata. Its search endpoint does not expose source keys. The current `exerciseSchema` requires non-null `level`, `category` and arrays, so catalog items cannot be passed through that parser unchanged.
- The sync queue generates and persists an `Idempotency-Key` per job. `queuePayloadRemap.ts` can replace IDs recursively, and `SyncEngine.ts` can add `baseVersion`. The final contract must define when the immutable request and key are frozen and how remapping or version changes produce a new operation.
- Current record and exercise schemas disagree with some TypeScript nullability. For example, `WorkoutRecord.workoutId` allows null in the type while `workoutRecordSchema` requires a string. Fixtures must exercise deleted-source history through the actual parser.

## Release contract

See the [contract directory](../../contracts/v1/README.md) for the operation matrix and fixtures, and the [wire contract](../../contracts/v1/wire-contract.md) for decisions and client migration gates.
