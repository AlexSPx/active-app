# Android Maestro regressions

The default suite installs an Expo development client and serves JavaScript from the current checkout through Metro. JavaScript and accessibility changes therefore run without rebuilding the Android APK. Workout, history, and routine scenarios use the app's real SQLite storage; settings and interrupted sessions use their existing device-local stores. The suite needs no login, backend, sync service, EAS account, paid device service, or repository secrets.

## Local run

Use Bash `4+`, Node `24.6.0`, Yarn `1.22.22`, Java `17` or newer, Android SDK/emulator API `35`, GNU coreutils on `PATH`, and Maestro CLI `2.11.0` (see [.maestro-version](../../.maestro-version)). Install a compatible development client for `com.alexspx.activenext` on a disposable test AVD. The runner does not install or replace the app. It clears that package's app data before each independent flow. If you need to build a client, use a clean worktree or the APK artifact from CI; `android/` is generated and may contain local native edits, so do not run `prebuild --clean` over a native tree you need to keep.

Create and start a dedicated API 35 x86_64 AVD if needed:

```sh
avdmanager create avd --name Maestro_API_35 --package 'system-images;android-35;default;x86_64' --device pixel_6
emulator -avd Maestro_API_35
```

Install the pinned Maestro CLI and dependencies, then run the suite against an explicit device when multiple emulators are attached:

```sh
maestro_version="$(cat .maestro-version)"
curl -fsSL "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${maestro_version}/maestro.zip" -o /tmp/maestro.zip
mkdir -p "$HOME/.local/share/active-maestro/$maestro_version"
unzip -q -o /tmp/maestro.zip -d "$HOME/.local/share/active-maestro/$maestro_version"
yarn install --frozen-lockfile
yarn test:once
yarn typecheck
MAESTRO_UDID=emulator-5556 scripts/run-maestro-ci.sh
```

The runner starts `expo start --dev-client --max-workers 2` from this checkout, overriding the generated project's scheme with the committed app scheme. It finds a free port from `8081` through `8100` (or uses a free `MAESTRO_METRO_PORT`), runs `adb reverse` for that port on the selected device, and asks Expo's `/_expo/open` endpoint for the SDK-matched dev-client URL. It verifies the manifest URL belongs to that Metro server, probes the selected device through the reverse port, and checks that Android resolves the launch URL to the installed app. It then runs each selected flow separately: before a normal flow, it uses `adb shell pm clear` without launching the app, so the flow's first action opens the deep link and Expo can apply its dev-client launch flags on cold start. The persistence and session-recovery relaunch helpers force-stop/reopen through that URL without clearing data.

If Node or Yarn is managed outside your shell's `PATH`, activate Node `24.6.0` before running the commands. The runner uses the project-local Expo CLI and the pinned Maestro CLI fallback at `$HOME/.local/share/active-maestro/<version>/maestro/bin`.

Local output is written to `build/maestro-artifacts/`: `metro.log`, `dev-client-connection.txt`, one JUnit `results-<flow>.xml` and `maestro-<flow>.log` per flow, reset records, Maestro `debug/` and `run/` output, `logcat.txt`, and `final-screen.png`. Set `MAESTRO_ARTIFACT_DIR` to preserve output elsewhere. Set `MAESTRO_UDID` when more than one Android device is ready; the runner refuses an ambiguous target. `MAESTRO_FLOWS` can select one flow file or a directory. To keep the data created with an older APK for the optional upgrade scenario, run:

```sh
MAESTRO_UDID=emulator-5556 MAESTRO_PRESERVE_APP_DATA=1 MAESTRO_FLOWS=maestro/upgrade/retains-local-data.yaml scripts/run-maestro-ci.sh
```

## CI

`.github/workflows/android-maestro.yml` runs Jest and typecheck on Ubuntu 24.04, generates an Android project from committed Expo config, and fingerprints the native client inputs. It restores a cached debug development-client APK only for an exact matching key. The key covers the runner image, Android SDK package manifests, pinned Node/Java/API/ABI, package and lock files, Expo config, native plugins and their icon/widget inputs, plus the generated Android project. Pure application JavaScript and Maestro selector changes do not affect it; dependency, SDK, generated-native, plugin, or app-config changes do. A cache miss builds `assembleDebug`; a cache hit skips Gradle and installs the compatible APK. Both paths run the current checkout's JS through Metro. The workflow tests an x86_64 API 35 emulator and uploads the development APK and diagnostics for 14 days.

The APK is debug-signed and is a test client, not a distribution build. The workflow uses no production signing credentials, EAS, cloud device service, or repository secrets. The standalone release APK path is not part of the default UI suite.

## Coverage and limits

The PR suite covers fresh onboarding, workout creation with multiple exercise sets and reopening stored values, edit/discard preservation, completion and history values, SQLite persistence after force-stop/relaunch, interrupted-session recovery, routine scheduling, settings persistence, and workout deletion. Maestro drives visible UI controls; it does not seed the database directly. The runner clears app state between independent scenarios. Persistence assertions within a scenario and the separate upgrade scenario retain data.

`maestro/upgrade/retains-local-data.yaml` is excluded from the PR suite. It requires a previous compatible APK signed with the same Android certificate and using package ID `com.alexspx.activenext`, with a local workout and completed record named `Upgrade Retention Check`. Install the older APK, create the records through its UI, install the current compatible development client with `adb install -r` without clearing data, then run the command above. `MAESTRO_PRESERVE_APP_DATA=1` is required for this scenario and refuses a multi-flow selection. No previous APK is included in the repository, so CI does not claim this flow passed.
