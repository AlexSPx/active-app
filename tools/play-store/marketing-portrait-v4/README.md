# Active Next portrait marketing slides, v4

Eight 1080 × 2400 PNGs are in `slides/`; `active-next-portrait-v4.zip` contains the same eight files. `contact-sheet.png` previews the set. Rebuild with `python3 compose.py` (Python 3 and Pillow).

This version enriches the backgrounds with lavender and plum gradients, luminous glows, sweeping translucent ribbons, and sparse orange accents. The unmodified source captures, phone frames, headlines, and opening-slide logo are included with the composition script.

## Capture provenance

The eight `sources/` PNGs are unmodified ADB screencaps of the installed Active Next Android app, taken November 9, 2026 on the existing disposable Android 15 emulator. The viewport was set to 1080 × 2400 at 360 dpi before capture. Light and Dark were selected in the app's Appearance settings; filenames record the theme and screen. No generated, redrawn, stretched, or recolored app UI was used. Captures use the existing fictional device-local training data from the original verified capture setup: app version 2.1.0, source revision `2cd9eb361a279e6081918163d9fe0125bf1f0d2d`, release APK SHA-256 `cd7a2ec3f474250b0a2eda2be75d75c1c467c0fcd716bcd4fad86f0617dcff98`. The workout screenshot shows a newly started empty session; that temporary session was cancelled after capture. No reseeding was performed.

`source-sha256.json` records the hashes of the original captures. The compositor scales each 1080 × 2400 capture uniformly to 756 × 1680, masking only the rounded screen corners, then adds the frame and artwork. The app's existing icon and DM Sans fonts are included for reproducibility; font license is in `fonts/`.

The emulator's original physical 1080 × 1920 size, 360 dpi override, and Light app appearance were restored after capture.
