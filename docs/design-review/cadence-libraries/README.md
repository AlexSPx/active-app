# ALE-102 Android acceptance

Final layout checks were captured on 2026-10-18 on `emulator-5554` at 320 × 640 px using the existing `com.alexspx.activenext` development client and Metro on port 8081. The app hot-reloaded the TypeScript and style edits; no native rebuild was needed. The existing QA workout and active weekly routine were preserved.

## Final visual checks

- The Workouts header remains “Workouts” on both library tabs, with the segmented control and cards fitting the 320 px width. See `workout-library.png` and `routine-cycle-library.png`.
- Workout detail expands an exercise row to show saved set targets. The QA bench press shows 20 kg × 8 reps in `workout-detail.png`; `workout-detail-collapsed.png` shows the closed state.
- Created `QA-ALE102-Cycle` through the routine editor using the saved QA workout on Day 1 and Rest on Day 2. It remained inactive. Its library day tiles and detail are in `routine-cycle-library.png` and `cycle-routine-detail.png`. The temporary routine was deleted through the app after capture; the existing QA workout and weekly routine were left intact.
- Dark mode was checked on both libraries and workout detail. `dark-workout-detail-expanded.png` is scrolled to show the set table; `dark-workout-detail.png` shows the full collapsed detail.
- At system font scale 1.3, both libraries reflow while keeping the routine day tiles and primary actions visible. `large-text-workout-detail.png` is scrolled to show the saved targets; the title is above the viewport, not clipped. Font scale was restored to 1.0 and appearance to System afterward.

## Automated verification

All 68 Jest suites passed (414 tests), including workout and routine details, library behavior, cards, empty states, and deferred workout-library refresh. `tsc --noEmit` and Prettier checks on the changed source, tests, and this README passed. The detail tests cover saved set targets and a blank linked workout title using “Untitled workout” in both visible and accessible text. This pass verified Android only; web, iOS, and production export were not run.

## Earlier acceptance artifacts

The following screenshots and interaction notes were captured in an earlier acceptance pass and were not all repeated after the final layout edits: `weekly-routine-library-active.png`, `weekly-routine-detail.png`, `home-weekly-active.png`, `weekly-editor-active-switch.png`, `routine-library-bottom-spacing.png`, `routine-delete-dialog.png`, `dark-routine-delete-dialog.png`, `large-text-routine-detail.png`, and the editor/delete workflows described in the original ALE-102 run. The active-routine editor discrepancy documented there is linked ALE-38 scope.
