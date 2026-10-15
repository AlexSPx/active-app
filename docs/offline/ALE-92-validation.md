# ALE-92 validation

This change removes PostHog event collection and remote push token registration. The app keeps notification permission controls and local rest timer alerts. Expo OTA updates remain configured.

## Automated checks

- `yarn test:once` passed 49 suites and 327 tests.
- `node_modules/.bin/tsc --noEmit` passed.
- `git diff --check` passed.

## Native and OTA configuration

The resolved public Expo config reports SDK `55.0.0`, app version `2.0.0`, the EAS project ID `8dee9569-7b46-47df-b72f-21833f59e85c`, and the update URL `https://u.expo.dev/8dee9569-7b46-47df-b72f-21833f59e85c`. `runtimeVersion.policy` is `appVersion`.

The config and native module list came from these commands:

```sh
node_modules/.bin/expo config --type public --json
node_modules/.bin/expo prebuild --platform android --no-install
node_modules/.bin/expo-modules-autolinking resolve --platform android --json
```

`expo prebuild --platform android --no-install` generated Android metadata with updates enabled, the same update URL, runtime version `2.0.0`, launch check `ALWAYS`, and launch wait `0` milliseconds. The config omits `updates.checkAutomatically`, `updates.fallbackToCacheTimeout`, `updates.useEmbeddedUpdate`, and `updates.enabled`. The installed SDK 55 config plugin defaults these values to `ALWAYS`, `0`, `true`, and enabled when an update URL is set. SDK 55 also maps an explicit `ON_LOAD` setting to Android's `ALWAYS` value. Expo Updates can contact the configured update URL at app launch.

Android module resolution includes `expo-updates` and `expo-notifications`. It excludes `expo-insights`. PostHog and its key are absent from the app source, dependency manifest, lockfile, Docker build arguments, and development environment file. `expo-eas-client` remains because `expo-updates` uses it.

## Emulator UI check

On 2026-10-15, the existing Android development client scheduled a rest timer with Wi-Fi and mobile data disabled. The app was backgrounded through the deadline. Android reported the exact alarm at 12:38:25 EEST, and the notification shade showed `Rest complete` with `Time to start your next set.` at 12:38:47 EEST. This confirms that the local rest alert works without network access.

[Android notification evidence](ALE-92-rest-notification.png)

## Release checks still open

No release app was built or inspected. iOS native checks were unavailable on this Linux host; the checkout had about 1.3 GB of free disk space for a fresh Android build. No release traffic capture or OTA update download and install check was run. The generated Android project and the running development client do not prove release egress behavior or OTA delivery. Keep both checks open until they run against a release build.
