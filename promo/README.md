# Active Next — Cadence Alive

A 32-second vertical promotional video in the app's current Cadence palette and DM Sans typography. Kinetic type, a dimensional dumbbell, animated week selection, set completion, rest timer, a drawing progress chart, and the official app icon at the close. Original synthesized 120 BPM instrumental, with UI chimes and transition sounds.

The bundled home screen at `public/screens/home.png` comes from the approved Cadence design. Other UI is recreated for animation using the same palette and sample data. This is a promotional visualization, not an emulator recording. Progress values are illustrative. The closing card uses the existing production fox icon.

## Render

Requires Node, Python 3, FFmpeg, and Chrome. All JavaScript dependency versions are pinned in `package.json`.

```sh
cd promo
npm ci
python3 -m venv .venv
.venv/bin/pip install numpy
.venv/bin/python scripts/soundtrack.py
ffmpeg -i public/soundtrack.wav -af loudnorm=I=-14:TP=-1:LRA=9 -ar 48000 -y public/master.wav
mv public/master.wav public/soundtrack.wav
npm run render
npm run poster
python3 scripts/verify.py
```

The render scripts use `/opt/google/chrome/chrome`; change `--browser-executable` for another machine. `npm run studio` opens the editable timeline. Generated media lives in `out/` and is ignored by Git. No app source is changed.

## Edit timing

All timing uses 30fps in `src/video.jsx`:

| Time   | Scene                      |
| ------ | -------------------------- |
| 0–4s   | Your next rep starts here  |
| 4–9s   | Training rhythm and home   |
| 9–15s  | Set logging and rest timer |
| 15–21s | Progress                   |
| 21–26s | Local storage              |
| 26–32s | Active Next                |

Audio cue times are in `scripts/soundtrack.py`. Keep those in sync when moving scenes. The video works without sound; there is no voice-over or uncaptioned speech. Fonts are bundled from the app under their OFL license. The original soundtrack contains no third-party samples.

The delivered video and poster are tracked at `../landing/assets/active-cadence-alive.mp4` and `../landing/assets/cadence-poster.png`. Preview and publish the landing page using `../landing/README.md`. To check the delivered video, run `python3 scripts/verify.py ../landing/assets/active-cadence-alive.mp4` from this directory. After rendering an updated video, copy it and the poster from `out/` to those landing assets before committing.
