# Active Next landing page

Standalone, buildless landing page in the app’s Cadence palette, with bundled DM Sans, an interactive training preview, and the 32-second Cadence Alive promo. No dependencies or external font requests. The Android closed test shows two steps: join the required Google Group, then join the test on Google Play with the same account. Both steps include locally bundled QR codes and direct links; the Play testing link also has a copy button. Public release status is “Coming soon”; project links point to `https://github.com/AlexSPx/active-app`.

## Preview

From the repository root:

```sh
python3 -m http.server 4173 --directory landing --bind 127.0.0.1
```

Open `http://localhost:4173`. Deploy the contents of `landing/` to any static host. The mobile app and its routing are unchanged.

## Content

- `index.html`, `styles.css`, `script.js`: page, responsive styling, keyboard-accessible tabs and sample set logging.
- `assets/`: self-contained copies of the app font and license, icon, home preview, promo poster, and rendered video. The video is copied from `promo/out/active-cadence-alive.mp4`; replace that copy when the promo changes.
- `DESIGN.md`: palette, layout, and design decisions.
- `legal/privacy-policy.html` and `legal/terms-and-conditions.html`: standalone Cadence-styled legal pages, linked from the landing page. These HTML articles are the single source of truth for legal copy. After editing either article, run `npm run legal:sync` from the repository root. This generates `features/legal/legalContent.json` (bundled for both native and web app screens) and the standalone `public/privacy-policy.html` used by the app’s static export. Commit those generated files with the source changes. Do not edit generated copies directly. The app uses the bundled documents offline without fetching different terms from the API. `npm run legal:check` and the Pages workflow reject stale generated copies. The converter supports headings, paragraphs, lists, separators, emphasis, code, and absolute links; unsupported tags fail generation.

Video playback is user-controlled and includes music, sound effects, and on-screen text, with no spoken audio. Preview values are illustrative. The page does not collect data or offer a waitlist. Add verified store links when the app is released.

## Store listing URLs

Serve the entire `landing/` directory from a public HTTPS host. Use `/legal/privacy-policy.html` for the Play Store privacy policy URL and `/legal/terms-and-conditions.html` for terms. Both documents load directly without JavaScript, sign-in, or opening the landing page first. Localhost preview URLs cannot be used in a store listing.

## Publish to GitHub Pages

1. In [the repository's Pages settings](https://github.com/AlexSPx/active-app/settings/pages), set **Build and deployment → Source** to **GitHub Actions**. Do not select a Jekyll template or branch source.
2. Merge the pull request containing `.github/workflows/pages.yml` into `master`.
3. Open **Actions → Publish landing page** and wait for the deployment to finish. If you enabled Pages after merging, select **Run workflow**, choose `master`, and run it once.
4. Open `https://alexspx.github.io/active-app/`.

The workflow checks links on pull requests and publishes changes to `landing/` after they merge into `master`. It uploads only the static site files, including the rendered MP4. It does not install the app or render the promo during deployment.

Use these URLs after the first successful deployment:

- Landing page: `https://alexspx.github.io/active-app/`
- Play Store privacy policy: `https://alexspx.github.io/active-app/legal/privacy-policy.html`
- Terms of Service: `https://alexspx.github.io/active-app/legal/terms-and-conditions.html`

All site links and assets are relative, so the `/active-app/` prefix works without a build step. Run `python3 landing/verify.py` before publishing changes. For GitHub's setup instructions, see [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
