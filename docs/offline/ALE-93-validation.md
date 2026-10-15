# ALE-93 validation

Implemented from fresh `origin/master` (`242162f`) on `codex/offline-launch-next-20261015`.

## Automated checks

- TypeScript: `npx tsc --noEmit` passes.
- Full Jest suite: 54 suites / 338 tests pass, including owned SQLite provider lifecycle, bundled native legal, and pending notification scheduling tests.
- Device erase tests exercise real auth/profile persistence with native boundaries mocked: retained owners, credentials, notifications, cache, storage namespaces, database detach, injected notification/credential/database/storage failure, restart/retry, orphan SQLite sidecars.
- Provider tests verify migration and `closeAsync` finish before deletion is permitted and initialization failure closes once.
- `npx expo prebuild --no-install --platform all` passes. Generated native folders are ignored, rather than committed.
- Inspected `android/app/src/main/AndroidManifest.xml`: `allowBackup=false`, `fullBackupContent=@xml/active_next_backup_rules`, `dataExtractionRules=@xml/active_next_data_extraction_rules`. Generated XML excludes app root/files/database/shared preferences/external data and Android 12 device-protected cloud/device-transfer domains.
- Inspected `ios/ActiveNext/AppDelegate.swift`: launch invokes `ActiveNextBackupExclusions.apply()`, which marks Documents and Library excluded from backup. No dependency source patch is used. Native local startup deletes obsolete remote credentials; future secure credential writes use device-only Keychain accessibility.

## Runtime and release limits

Android target: the existing `emulator-5554`, Android 15. No physical device attached. The first attempts to open the fresh worktree via Metro failed with `java.io.IOException: unexpected end of stream`; a later single-worker Metro attempt reached bundling. Final runtime result is recorded below.

Android production export was attempted and stopped after memory pressure exhausted available host memory and caused heavy swapping. No completed production binary/export is claimed. Generated rules are source artifact evidence, not an installed backup/restore result.

iOS runtime/build, Android/iOS cloud backup/restore, release network capture, and store declarations require ALE-94 release verification. Linux has no iOS simulator/Xcode. The policy/store draft explicitly accounts for permitted Expo OTA metadata; no zero-network claim is made. Public policy is prepared but not deployed. Publisher, privacy/support contact, and public hostname remain placeholders at the user's request.

## Android development checks

A single-worker Metro session successfully bundled and opened the fresh worktree on Android 15. Verified local profile/data menu and bundled privacy draft rendered with placeholders. This dev-client check does not validate the newly generated backup plugin in an installed release binary.

Verified confirmed erase returned to **Set Up Profile** and remained there after force-stop/relaunch. The first live attempt exposed that SQLite returns a raw directory path while legacy FileSystem expects `file://`; corrected that boundary and added realistic native-path/URI-decoding regressions. All-owner deletion verification now uses that normalized path. A private app-data backup was taken before erase and restored afterward to preserve the emulator's prior test profile. No claim of a full native release acceptance matrix is made.
