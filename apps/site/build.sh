#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
site="$repo/apps/site"
model="$repo/tools/exercise-model"
output=${1:-"$repo/_site"}

node "$model/build-group-index.mjs" >/dev/null
mkdir -p "$output"
cp "$site"/{index.html,styles.css,script.js,exercises.html,exercises.css} "$output/"
cp -R "$site"/{assets,legal} "$output/"
cp "$model"/{anatomy.glb,CC-BY-SA-4.0.txt,ICT-FaceKit-LICENSE.txt} "$output/assets/"
"$model/node_modules/.bin/esbuild" "$model/viewer.mjs" --bundle --format=esm --target=es2022 \
  --minify --legal-comments=inline --banner:js="/*$(cat "$model/VIEWER-LICENSES.txt")
*/" --outfile="$output/assets/exercise-viewer.mjs"
python3 "$site/verify.py" "$output"
