# Android release testing

Jest and typecheck run on every pull request, push to `master`, and merge-queue check. The Android APK build and Maestro suite run only on pull requests with the `Release` label or a manual workflow run. The suite tests a standalone release-mode APK with bundled JavaScript and real device storage. It needs no Metro server, development client, backend, EAS account, or paid device service.

## Prepare a release PR

1. Create a branch such as `release/2.2.0` from `master`.
2. Update the app version and release notes, then open a PR into `master` titled `Release 2.2.0`.
3. Add the repository's `Release` label. The label defines a release PR; the title and branch name are conventions.
4. Wait for Jest, typecheck, and `Release APK and Maestro UI flows` to pass before merging.

Adding the label starts the release checks, and subsequent commits rerun them while the label remains attached. Removing the label skips the Android job on the resulting run. Ordinary merges into `master` run Jest and typecheck without rebuilding the APK. Merge-queue checks also run only Jest and typecheck; run the release tests before enqueueing a release PR.

To run the release tests manually after this workflow is on `master`, open Actions, select **Android release checks**, choose **Run workflow**, and select the branch to test. A manual run builds the APK and runs the full suite without a label.

The workflow does not publish the app or create a GitHub Release. Store submission and production signing remain separate. The Maestro job is skipped on ordinary PRs, so verify its successful result on the current release candidate before merging a `Release` PR.

## Run locally

Use Bash 4 or newer, Node `24.6.0`, Yarn `1.22.22`, Java `17`, the Android SDK with an API 35 x86_64 emulator, GNU coreutils, and Maestro CLI `2.11.0`. Use a disposable test emulator: each independent flow clears `com.alexspx.activenext` app data. Restart assertions within a flow retain data.

Install the pinned Maestro CLI:

```sh
maestro_version="$(cat .maestro-version)"
curl -fsSL "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${maestro_version}/maestro.zip" -o /tmp/maestro.zip
mkdir -p "$HOME/.local/share/active-maestro/$maestro_version"
unzip -q -o /tmp/maestro.zip -d "$HOME/.local/share/active-maestro/$maestro_version"
```

The following build command replaces the generated `android/` directory. Use a clean checkout if you have native edits to preserve. Start your disposable API 35 emulator, then build, install, and test:

```sh
yarn install --frozen-lockfile
EXPO_OFFLINE=1 EXPO_NO_DOTENV=1 EXPO_NO_CLIENT_ENV_VARS=1 MAESTRO_TEST_BUILD=1 yarn expo prebuild --platform android --no-install --clean
(cd android && ./gradlew --no-daemon -PreactNativeArchitectures=x86_64 assembleRelease)
adb install -r android/app/build/outputs/apk/release/app-release.apk
scripts/run-maestro-ci.sh
```

The generated release APK uses a test signing key. `MAESTRO_TEST_BUILD=1` disables OTA updates in the generated test APK so tests exercise its bundled code. Ordinary app builds retain their existing update configuration. CI disables dotenv loading and public environment-variable inlining and uses no repository secrets.

Set `MAESTRO_UDID` to select a device when more than one is connected. Set `MAESTRO_FLOWS` to a flow file or directory to select tests. `MAESTRO_ARTIFACT_DIR` changes the output directory, which defaults to `build/maestro-artifacts/`. The runner saves JUnit results, Maestro logs and screenshots, Android logcat, and a final screenshot. CI uploads these files and `build/android-release.apk` for 14 days.

## Coverage and limits

The six flows cover onboarding, workout creation and stored targets, completion and history values, persistence after force-stop, edit/discard and deletion, active-session recovery, routine scheduling, and theme persistence. Workout and history assertions exercise real SQLite; settings and sessions use their existing device-local stores.

Upgrade retention is excluded from the default suite. It requires a previous APK with the same signing certificate and package ID, containing a workout and completed history record named `Upgrade Retention Check`. Install the candidate over it with `adb install -r`, without clearing data, then run:

```sh
MAESTRO_FLOWS=maestro/upgrade/retains-local-data.yaml scripts/run-maestro-ci.sh
```

The upgrade flow retains data. No compatible previous APK is included in the repository, so normal CI does not execute or claim upgrade coverage.
