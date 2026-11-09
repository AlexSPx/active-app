# Play Store phone screenshots

The latest marketing set is [portrait v4](marketing-portrait-v4/README.md): eight 1080 × 2400 slides with phone frames, real light and dark captures, and enhanced backgrounds. [Preview](marketing-portrait-v4/contact-sheet.png) · [Download ZIP](marketing-portrait-v4/active-next-portrait-v4.zip). Earlier marketing versions were removed; the original raw captures below are retained as source material.

Real Android app captures with fictional, device-local training data. No UI mockups, image-generated screens, captions, or phone frames. PNGs are losslessly saved as RGB, removing the emulator’s fully opaque alpha channel.

## Source and capture setup

- App source: `origin/master` at `2cd9eb36` (full revision in `manifest.json`).
- Android 15 / API 35 emulator, 1080 × 1920 pixels, 360 dpi, gesture navigation.
- English UI, light appearance, kilograms, Europe/Sofia time zone.
- Fixture date: November 9, 2026. Four templates, a repeating seven-day routine, and 32 completed sessions over eight weeks, plus two progress widgets. Sam is a fictional local profile.
- Captured with ADB from a standalone release-mode APK, with OTA disabled for the capture build (`MAESTRO_TEST_BUILD=1`). The APK uses local test signing; it is not a Play submission artifact.

## Upload order

Use the numbered PNGs in `screenshots/en-US/` as the phone screenshots in the English Play Store listing. They are full-resolution 9:16 captures.

| File | App feature |
| --- | --- |
| `01-home.png` | Today's workout and weekly training rhythm |
| `02-workout-session.png` | Rep and weight logging during an active workout |
| `03-progress.png` | Exercise progression over eight weeks |
| `04-history.png` | Calendar and completed workout history |
| `05-session-detail.png` | Recorded sets, weights, and session totals |
| `06-workouts.png` | Saved workout templates |
| `07-routine.png` | Active routine and muscle coverage |
| `08-exercises.png` | Exercise catalog and muscle filtering |

## Recreate the data

Use a disposable emulator. The seed command replaces its local workouts, routines, history, widget settings, and active session. It refuses physical devices. Launch the app once so its current migrations create the database, then stop it before seeding.

```sh
adb root
python3 tools/play-store/seed-emulator.py --date 2026-11-09
adb shell am start -n com.alexspx.activenext/.MainActivity
```

Add `--active-session` for a populated Upper Body session with its first two sets completed. Run the ordinary seed again to return to the baseline dataset. The session timer starts approximately 18 minutes before seeding and then runs normally.

`device-ui.py` provides small UI inspection, accessibility-label tapping, deep-link navigation, and unmodified PNG capture helpers:

```sh
python3 tools/play-store/device-ui.py dump
python3 tools/play-store/device-ui.py tap 'History'
python3 tools/play-store/device-ui.py open routines/store-routine
python3 tools/play-store/device-ui.py capture /tmp/screenshot.png
```

For the standard release APK build, follow `../../docs/testing/android-maestro.md`. This machine needed `formatter.init.gradle` selecting cached Spotless 8.1.0 for the third-party formatting plugin instead of 8.4.0. That affects build-time formatting tooling only; app source and native runtime dependency versions were unchanged.

The capture build used `./gradlew --no-daemon --init-script ../../../tools/play-store/formatter.init.gradle -PreactNativeArchitectures=x86_64 assembleRelease` from `apps/client/android`, with the Expo environment variables above.
