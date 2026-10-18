# Cadence native overlays

Android emulator evidence for ALE-99, captured on October 18, 2026.

- `confirmation-light.png`: routine deletion confirmation. Repeated Delete, cancel, Android back, and deletion of the disposable test routine passed.
- `widget-dark.png`: dark appearance and Lucide icons. Handle drag dismissed the sheet after a cold client reload.
- `widget-keyboard.png`: a real Android keyboard with the action footer above it. Cancel and reopen reset the query, exercise selection, and metric.

The existing sample workout was preserved, so the empty-workout picker has consumer regression coverage but no live empty-state capture. The test routine was removed and the emulator's appearance and input method were restored.

Saving the test routine persisted it, then navigation hit the native Screens header error already fixed by `patches/react-native-screens+4.23.0.patch`. Both installed clients predate that October 16 patch. Rebuild the dev client and repeat save-and-return verification. No client was rebuilt during this change.
