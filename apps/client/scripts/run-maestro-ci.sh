#!/usr/bin/env bash
set -uo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir" || exit 1

maestro_version="$(cat .maestro-version)"
local_maestro="$HOME/.local/share/active-maestro/$maestro_version/maestro/bin"
if ! command -v maestro >/dev/null 2>&1 && [[ -x "$local_maestro/maestro" ]]; then
  export PATH="$local_maestro:$PATH"
fi
for required_command in maestro adb timeout; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf '%s is required. See docs/testing/android-maestro.md.\n' "$required_command" >&2
    exit 127
  fi
done
maestro_actual_version="$(maestro --version 2>/dev/null || true)"
if [[ "$maestro_actual_version" != "$maestro_version" ]]; then
  printf 'Maestro CLI %s is required; found %s.\n' "$maestro_version" "${maestro_actual_version:-unknown}" >&2
  exit 2
fi

device_list="$(adb devices)" || exit 1
mapfile -t connected_devices < <(awk 'NR > 1 && $2 == "device" { print $1 }' <<<"$device_list")
if [[ -n "${MAESTRO_UDID:-}" ]]; then
  test_device="$MAESTRO_UDID"
  if ! printf '%s\n' "${connected_devices[@]}" | awk -v id="$test_device" '$0 == id { found = 1 } END { exit !found }'; then
    printf 'MAESTRO_UDID=%s is not ready in adb devices.\n' "$test_device" >&2
    exit 2
  fi
elif [[ "${#connected_devices[@]}" -eq 1 ]]; then
  test_device="${connected_devices[0]}"
else
  printf 'Expected exactly one ready Android device. Set MAESTRO_UDID to select a device.\n' >&2
  exit 2
fi

artifact_dir="${MAESTRO_ARTIFACT_DIR:-build/maestro-artifacts}"
mkdir -p "$artifact_dir"
flows="${MAESTRO_FLOWS:-maestro/flows}"
if [[ ! -d "$flows" && ! -f "$flows" ]]; then
  printf 'Maestro flow path does not exist: %s\n' "$flows" >&2
  exit 2
fi

capture_diagnostics() {
  local command_status=$?
  trap - EXIT
  timeout 8s adb -s "$test_device" logcat -d -t 5000 > "$artifact_dir/logcat.txt" 2>&1 || true
  timeout 8s adb -s "$test_device" exec-out screencap -p > "$artifact_dir/final-screen.png" 2> "$artifact_dir/screenshot-error.txt" || true
  exit "$command_status"
}
trap capture_diagnostics EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

maestro test \
  --udid "$test_device" \
  --format JUNIT \
  --output "$artifact_dir/results.xml" \
  --debug-output "$artifact_dir/debug" \
  --flatten-debug-output \
  --test-output-dir "$artifact_dir/run" \
  "$flows" 2>&1 | tee "$artifact_dir/maestro.log"
test_status=${PIPESTATUS[0]}
exit "$test_status"
