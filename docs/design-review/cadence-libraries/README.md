# ALE-102 Android acceptance

Captured 2026-10-18 on `emulator-5554` at 320 × 640 px using the existing `com.alexspx.activenext` development client and Metro on port 8081. No native rebuild or source edits were made. The first cold launch opened Expo Dev Launcher; selecting `http://10.0.2.2:8081` initially showed a blank screen while Metro's first bundle attempt was killed at 62.9% under host memory pressure. After the concurrent export finished, the app became interactive. No React Native runtime exception was observed.

## Completed

- Created `QA-ALE102-Strength-Workout` through the app with Barbell Bench Press – Medium Grip, one set at 20 kg × 8 reps, plus a QA note. The workout library card shows the title, one exercise, one set, estimated duration, and exercise name.
- Opened the workout detail and edit form. Android Back from the edit form returned to detail. Scrolling the detail exposed the saved exercise. Workout overflow → Delete → Cancel returned to the intact card.
- Created `QA-ALE102-Weekly` as a Flexible week with the saved QA workout. One tap on **Set active routine** marked the card Active; Home then showed the routine and workout for Oct 12–18, 2026. Routine detail shows the weekly label, workout count, Any order, aggregate muscle groups, and a workout row; tapping the row opened workout detail. Routine overflow → Delete → Cancel preserved the active card.
- Observed the linked ALE-38 editor issue: editing the active weekly routine opens with **Set as active routine** unchecked. I toggled it on and back off, then exited without saving; the persisted routine remained active. The edit checkbox is shown in `weekly-editor-active-switch.png`.
- Opened the repeating-cycle editor and assigned the QA workout to Day 1, then canceled the unsaved draft. No cycle routine was saved, so sequential rest behavior remains unverified on-device.

## Dark theme

Set in the app (Settings → Appearance → **Dark**), then the populated libraries and both detail screens were re-checked. Surfaces, cards, dividers, text, and the muscle diagrams all track the Cadence dark palette; the delete dialog and action sheet use the dark surfaces. No unreadable text, invisible borders, or non-adapting diagram colors.

## Large text (1.3×)

Set with `adb shell settings put system font_scale 1.3`, with the appearance back on System. Long titles wrap instead of truncating (for example `QA-ALE102-Strength-Workout` wraps to two lines on the card), metadata rows reflow, and the Start/Edit action labels stay inside their buttons. No text was clipped and nothing was hidden behind the floating tab bar.

## Follow-up fixes re-verified

- The routines list bottom clearance now matches the workouts list (`routine-library-bottom-spacing.png`); the last card is fully visible and not overlapped by the floating tab bar.
- The Delete-routine dialog now matches the workout dialog and the Settings destructive pattern: the destructive action is the bordered surface button with red text, and Cancel is the raised secondary button (`routine-delete-dialog.png`).

## Limits and device state

- Device settings were restored: system font scale back to `1.0` and the app appearance back to **System**.
- I did not start a workout session or confirm deletion of either QA record. Both remain on the emulator for review; automated checks cover the running-workout deletion guard.

## Screenshots

- `workout-library.png`, `workout-detail.png` — populated workout library and detail (light).
- `weekly-routine-library-active.png`, `weekly-routine-detail.png` — active weekly routine library and detail (light).
- `home-weekly-active.png` — Home schedule from the active routine.
- `weekly-editor-active-switch.png` — editor checkbox state for the known ALE-38 issue.
- `routine-library-bottom-spacing.png` — routines list scrolled to its end.
- `routine-delete-dialog.png` — routine delete confirmation.
- `dark-workout-library.png`, `dark-routine-library.png`, `dark-workout-detail.png`, `dark-routine-detail.png`, `dark-routine-delete-dialog.png` — dark theme.
- `large-text-workout-library.png`, `large-text-routine-library.png`, `large-text-workout-detail.png`, `large-text-routine-detail.png` — 1.3× system font scale.
