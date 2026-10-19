#!/usr/bin/env bash
set -euo pipefail

# Run with the existing development client: PORT=8083 ./scripts/preview-cadence-native.sh
# The launcher temporarily switches package.json main and restores that field on exit.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_file="$project_root/package.json"
preview_main="${PREVIEW_MAIN:-components/dev/cadence-preview/entry.tsx}"
lock_dir="$project_root/.cadence-preview.lock"

if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "A Cadence preview is already running (or .cadence-preview.lock is stale)." >&2
  exit 1
fi
backup_file=""

restore_main() {
  if [[ -n "$backup_file" && -s "$backup_file" ]]; then
    if ! node - "$package_file" "$backup_file" "$preview_main" <<'NODE'
const fs = require('fs')
const [packageFile, backupFile, previewMain] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
const originalMain = JSON.parse(fs.readFileSync(backupFile, 'utf8')).main

if (pkg.main === previewMain) {
  pkg.main = originalMain
  fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`)
} else if (pkg.main !== originalMain) {
  console.warn(`Preserving package.json main changed during preview: ${pkg.main}`)
}
NODE
    then
      echo "Could not restore package.json main; review the file before starting the app." >&2
    fi
  fi
  if [[ -n "$backup_file" ]]; then rm -f "$backup_file"; fi
  rmdir "$lock_dir" 2>/dev/null || true
}
trap restore_main EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

backup_file="$(mktemp)"
node - "$package_file" "$backup_file" "$preview_main" <<'NODE'
const fs = require('fs')
const [packageFile, backupFile, previewMain] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
if (pkg.main === previewMain) {
  throw new Error('package.json already points at the Cadence preview entry')
}
fs.writeFileSync(backupFile, JSON.stringify({ main: pkg.main }))
pkg.main = previewMain
fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`)
NODE

cd "$project_root"
"$project_root/node_modules/.bin/expo" start --max-workers 2 --dev-client --port "${PORT:-8083}" --lan "$@"
