#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
if [[ ! -d android ]]; then
  printf 'Android project is missing. Run Expo prebuild before fingerprinting the dev client.\n' >&2
  exit 1
fi
android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$android_sdk" || ! -d "$android_sdk" ]]; then
  printf 'ANDROID_HOME or ANDROID_SDK_ROOT must point to the installed Android SDK before fingerprinting.\n' >&2
  exit 1
fi

{
  printf '%s\n' 'active-next-android-dev-client-fingerprint-v1'
  for file in package.json yarn.lock app.config.js scripts/android-dev-client-fingerprint.sh; do
    sha256sum "$file"
  done

  for input_dir in plugins assets/icons features/training/widgets .yarn/patches; do
    [[ -d "$input_dir" ]] || continue
    while IFS= read -r -d '' file; do
      sha256sum "$file"
    done < <(find "$input_dir" -type f -print0 | sort -z)
  done

  while IFS= read -r -d '' file; do
    sha256sum "$file"
  done < <(
    find android \
      -type d \( -name build -o -name .gradle \) -prune -o \
      -type f ! -name local.properties -print0 |
      sort -z
  )

  while IFS= read -r -d '' file; do
    printf '%s\n' "${file#"$android_sdk"/}"
    sha256sum "$file"
  done < <(
    find "$android_sdk" -maxdepth 6 -type f \
      \( -name source.properties -o -name package.xml \) -print0 |
      sort -z
  )
} | sha256sum | awk '{ print $1 }'
