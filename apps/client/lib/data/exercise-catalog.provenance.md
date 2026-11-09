# Bundled exercise catalog

`exercise-catalog.json` is a local search/editor catalog generated from the active service checkout's pinned dataset. It contains 876 exercises.

## Source and license

- Dataset: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), `dist/exercises.json`
- Pinned upstream revision: `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`
- Source file SHA-256: `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`
- Service source: `active-service-ale71/src/main/resources/catalog/exercises.json`
- License: Unlicense; the complete license is in [LICENSE.exercise-catalog.md](LICENSE.exercise-catalog.md)

The artifact drops the upstream `images` field because search and the workout editor use only exercise identity and metadata. Both the client and Rust service consume this same artifact. Regenerate it with `python3 scripts/generate-exercise-catalog.py`; use `--source /path/to/exercises.json` to work from a local copy or `--check` to compare without writing. The generator verifies the pinned upstream SHA-256 before reading the data. The service embeds the artifact at build time and does not fetch it at startup.

## IDs and metadata

Each artifact row keeps the upstream slug in `sourceKey` and uses `local:exercise:<sourceKey>` as its stable local `id`. Namespaced IDs identify entries in this bundled dataset; they are not backend UUIDs and must not be sent as backend exercise IDs. The service importer generates database UUIDs and stores source slugs separately, so syncing a locally selected exercise requires an explicit source-key-to-backend-UUID mapping. Existing UUIDs in stored workout templates are not rewritten by this catalog.

The artifact carries the exercise name, level, force, mechanic, equipment, primary and secondary muscles, instructions, and category. Names, muscle arrays, and instructions preserve source text and array order. Enum values use the service/API representation: uppercase names with spaces and hyphens replaced by underscores; nullable force, mechanic, and equipment remain `null`. `sourceKey` remains alongside the local ID for provenance and a future explicit mapping.

At search time, cached UUID exercises in non-deleted workout templates are shown separately from bundled exercises, even when their names match. Their original IDs and stored metadata are retained; unavailable metadata uses editor-only defaults. A matching name does not establish identity, and this lookup never rewrites templates.
