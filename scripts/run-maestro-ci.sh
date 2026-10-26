#!/usr/bin/env bash
set -uo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir" || exit 1

maestro_version="$(cat .maestro-version)"
local_maestro="$HOME/.local/share/active-maestro/$maestro_version/maestro/bin"
if ! command -v maestro >/dev/null 2>&1 && [[ -x "$local_maestro/maestro" ]]; then
  export PATH="$local_maestro:$PATH"
fi
if ! command -v maestro >/dev/null 2>&1; then
  printf 'Maestro CLI %s is required. Install it using docs/testing/android-maestro.md, then rerun this script.\n' "$maestro_version" >&2
  exit 127
fi
if ! command -v adb >/dev/null 2>&1; then
  printf 'Android adb is required to select the emulator and collect diagnostics.\n' >&2
  exit 127
fi
if ! command -v node >/dev/null 2>&1 || [[ ! -x "$repo_dir/node_modules/.bin/expo" ]]; then
  printf 'Install the pinned project dependencies and put Node.js on PATH before running this script.\n' >&2
  exit 127
fi
node_version="$(node --version 2>/dev/null || true)"
if [[ "$node_version" != 'v24.6.0' ]]; then
  printf 'Node.js v24.6.0 is required; found %s.\n' "${node_version:-unknown}" >&2
  exit 2
fi
maestro_actual_version="$(maestro --version 2>/dev/null || true)"
if [[ "$maestro_actual_version" != "$maestro_version" ]]; then
  printf 'Maestro CLI %s is required; found %s.\n' \
    "$maestro_version" "${maestro_actual_version:-unknown}" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  printf 'curl is required for Metro readiness checks.\n' >&2
  exit 127
fi
if ! command -v timeout >/dev/null 2>&1; then
  printf 'GNU timeout is required to bound Android diagnostics if the emulator disconnects.\n' >&2
  exit 127
fi

device_list="$(adb devices)" || {
  printf 'Unable to list Android devices with adb.\n' >&2
  exit 1
}
mapfile -t connected_devices < <(awk 'NR > 1 && $2 == "device" { print $1 }' <<<"$device_list")
if [[ -n "${MAESTRO_UDID:-}" ]]; then
  test_device="$MAESTRO_UDID"
  if ! printf '%s\n' "${connected_devices[@]}" | awk -v id="$test_device" '$0 == id { found = 1 } END { exit !found }'; then
    printf 'MAESTRO_UDID=%s is not ready in adb devices. Ready devices: %s\n' \
      "$test_device" "${connected_devices[*]:-(none)}" >&2
    exit 2
  fi
elif [[ "${#connected_devices[@]}" -eq 1 ]]; then
  test_device="${connected_devices[0]}"
else
  printf 'Expected exactly one ready Android device, found %s. Set MAESTRO_UDID to a device ID from adb devices.\n' \
    "${#connected_devices[@]}" >&2
  exit 2
fi
device_api="$(adb -s "$test_device" shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')"
if [[ "$device_api" != '35' ]]; then
  printf 'Android API 35 is required on %s; found API %s.\n' "$test_device" "${device_api:-unknown}" >&2
  exit 2
fi
device_abi="$(adb -s "$test_device" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r')"
if [[ "$device_abi" != 'x86_64' ]]; then
  printf 'Android x86_64 is required on %s; found %s.\n' "$test_device" "${device_abi:-unknown}" >&2
  exit 2
fi

app_config_json="$(EXPO_NO_DOTENV=1 EXPO_NO_CLIENT_ENV_VARS=1 \
  "$repo_dir/node_modules/.bin/expo" config --type prebuild --json)" || {
  printf 'Expo could not resolve the committed app config.\n' >&2
  exit 1
}
app_config_details="$(node -e '
  const config = JSON.parse(process.argv[1]);
  const packageName = config.android?.package ?? "";
  const configuredScheme = config.android?.scheme ?? config.scheme ?? `exp+${config.slug}`;
  const scheme = Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme;
  process.stdout.write([packageName, scheme ?? ""].join("\n"));
' "$app_config_json")" || exit 1
app_id="${app_config_details%%$'\n'*}"
app_scheme="${app_config_details#*$'\n'}"
if [[ -z "$app_id" ]]; then
  printf 'The committed Expo config does not define android.package.\n' >&2
  exit 1
fi
if [[ -z "$app_scheme" ]]; then
  printf 'The committed Expo config does not define an Android URL scheme.\n' >&2
  exit 1
fi
if ! adb -s "$test_device" shell pm path "$app_id" 2>/dev/null | grep -q '^package:'; then
  printf 'Development client %s is not installed on %s. Install a compatible debug APK before running the flows.\n' \
    "$app_id" "$test_device" >&2
  exit 1
fi

artifact_dir="${MAESTRO_ARTIFACT_DIR:-build/maestro-artifacts}"
mkdir -p "$artifact_dir"
flows="${MAESTRO_FLOWS:-maestro/flows}"
flow_files=()
if [[ -f "$flows" ]]; then
  flow_files=("$flows")
elif [[ -d "$flows" ]]; then
  mapfile -d '' -t flow_files < <(find "$flows" -type f -name '*.yaml' -print0 | sort -z)
else
  printf 'Maestro flow path does not exist: %s\n' "$flows" >&2
  exit 2
fi
if [[ "${#flow_files[@]}" -eq 0 ]]; then
  printf 'No Maestro .yaml flows found at %s.\n' "$flows" >&2
  exit 2
fi
preserve_app_data="${MAESTRO_PRESERVE_APP_DATA:-0}"
if [[ "$preserve_app_data" != 0 && "$preserve_app_data" != 1 ]]; then
  printf 'MAESTRO_PRESERVE_APP_DATA must be 0 or 1.\n' >&2
  exit 2
fi
if [[ "$preserve_app_data" == 1 && "${#flow_files[@]}" -ne 1 ]]; then
  printf 'MAESTRO_PRESERVE_APP_DATA=1 requires selecting exactly one flow.\n' >&2
  exit 2
fi
metro_pid=''
reverse_added=0
metro_port=''

capture_diagnostics() {
  local command_status=$?
  trap - EXIT

  if [[ -n "$test_device" ]]; then
    timeout 8s adb -s "$test_device" logcat -d -t 5000 > "$artifact_dir/logcat.txt" 2>&1 || true
    timeout 8s adb -s "$test_device" exec-out screencap -p > "$artifact_dir/final-screen.png" 2> "$artifact_dir/screenshot-error.txt" || true
  fi
  if [[ -n "$metro_pid" ]]; then
    kill "$metro_pid" 2>/dev/null || true
    wait "$metro_pid" 2>/dev/null || true
  fi
  if [[ "$reverse_added" -eq 1 ]]; then
    timeout 5s adb -s "$test_device" reverse --remove "tcp:$metro_port" >/dev/null 2>&1 || true
  fi
  exit "$command_status"
}
trap capture_diagnostics EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

port_is_free() {
  node -e '
const net = require("node:net");
const hosts = ["127.0.0.1", "::1"];
let pending = hosts.length;
let available = true;
const finish = () => {
  pending -= 1;
  if (pending === 0) process.exit(available ? 0 : 1);
};
for (const host of hosts) {
  const server = net.createServer();
  server.once("error", () => { available = false; finish(); });
  server.listen({ host, port: Number(process.argv[1]), exclusive: true }, () => server.close(finish));
}
' "$1" >/dev/null 2>&1
}

port_has_reverse() {
  adb -s "$test_device" reverse --list 2>/dev/null |
    awk -v wanted="tcp:$1" '{ for (i = 1; i <= NF; i++) if ($i == wanted) found = 1 } END { exit !found }'
}

if [[ -n "${MAESTRO_METRO_PORT:-}" ]]; then
  if [[ ! "$MAESTRO_METRO_PORT" =~ ^[0-9]+$ ]] || (( MAESTRO_METRO_PORT < 1024 || MAESTRO_METRO_PORT > 65535 )); then
    printf 'MAESTRO_METRO_PORT must be a TCP port from 1024 through 65535.\n' >&2
    exit 2
  fi
  if ! port_is_free "$MAESTRO_METRO_PORT" || port_has_reverse "$MAESTRO_METRO_PORT"; then
    printf 'Metro port %s is already in use. Choose a free port with MAESTRO_METRO_PORT.\n' "$MAESTRO_METRO_PORT" >&2
    exit 2
  fi
  metro_port="$MAESTRO_METRO_PORT"
else
  for candidate in {8081..8100}; do
    if port_is_free "$candidate" && ! port_has_reverse "$candidate"; then
      metro_port="$candidate"
      break
    fi
  done
fi
if [[ -z "$metro_port" ]]; then
  printf 'No free Metro port was found between 8081 and 8100. Set MAESTRO_METRO_PORT to an available port.\n' >&2
  exit 2
fi

metro_base_url="http://localhost:$metro_port"
if ! adb -s "$test_device" reverse "tcp:$metro_port" "tcp:$metro_port" > "$artifact_dir/adb-reverse.txt" 2>&1; then
  printf 'Could not set up adb reverse for %s on %s. See %s/adb-reverse.txt.\n' \
    "$metro_port" "$test_device" "$artifact_dir" >&2
  exit 1
fi
reverse_added=1

printf 'Starting this checkout’s Expo dev client Metro server on %s for %s.\n' "$metro_base_url" "$test_device"
EXPO_OFFLINE=1 \
EXPO_NO_DOTENV=1 \
EXPO_NO_CLIENT_ENV_VARS=1 \
EXPO_NO_TELEMETRY=1 \
EXPO_NO_DEV_MENU=1 \
EXPO_PACKAGER_PROXY_URL="$metro_base_url" \
  "$repo_dir/node_modules/.bin/expo" start --dev-client --localhost --port "$metro_port" \
  --scheme "$app_scheme" --max-workers 2 \
  > "$artifact_dir/metro.log" 2>&1 &
metro_pid=$!

dev_client_url=''
dev_server_app_id=''
dev_client_runtime=''
metro_open_response=''
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
  if ! kill -0 "$metro_pid" 2>/dev/null; then
    printf 'Expo Metro exited during startup. Recent output:\n' >&2
    tail -n 80 "$artifact_dir/metro.log" >&2 || true
    exit 1
  fi

  metro_status="$(curl -fsS --max-time 2 "$metro_base_url/status" 2>/dev/null || true)"
  if [[ "$metro_status" == *'packager-status:running'* ]]; then
    metro_open_response="$(curl -fsS --max-time 2 "$metro_base_url/_expo/open?platform=android&runtime=custom" 2>/dev/null || true)"
    if [[ -n "$metro_open_response" ]]; then
      open_details="$(node -e '
        const value = JSON.parse(process.argv[1]);
        const config = JSON.parse(process.argv[2]);
        const configuredScheme = config.android?.scheme ?? config.scheme ?? `exp+${config.slug}`;
        const scheme = Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme;
        const expoUrl = new URL(value.url);
        const manifestUrl = expoUrl.searchParams.get("__expo_url") ?? expoUrl.searchParams.get("url");
        if (!manifestUrl) process.exit(2);
        const launchUrl = new URL(`${scheme}://`);
        launchUrl.searchParams.set("__expo_url", manifestUrl);
        launchUrl.searchParams.set("__expo_disable_onboarding", "1");
        launchUrl.searchParams.set("__expo_disable_fab", "1");
        launchUrl.searchParams.set("__expo_disable_auto_launch", "1");
        process.stdout.write([launchUrl.toString(), value.appId ?? "", value.runtime ?? "", value.scheme ?? "", manifestUrl].join("\n"));
      ' "$metro_open_response" "$app_config_json" 2>/dev/null || true)"
      if [[ -n "$open_details" ]]; then
        mapfile -t open_values <<< "$open_details"
        dev_client_url="${open_values[0]:-}"
        dev_server_app_id="${open_values[1]:-}"
        dev_client_runtime="${open_values[2]:-}"
        expo_server_scheme="${open_values[3]:-}"
        manifest_url="${open_values[4]:-}"
        if [[ -n "$dev_client_url" && -n "$dev_server_app_id" && -n "$dev_client_runtime" && -n "$manifest_url" ]]; then
          break
        fi
      fi
    fi
  fi
  sleep 1
done

if [[ -z "$dev_client_url" ]]; then
  printf 'Expo Metro did not expose an Android dev-client URL on %s within 120 seconds. Recent output:\n' "$metro_base_url" >&2
  tail -n 100 "$artifact_dir/metro.log" >&2 || true
  exit 1
fi
if [[ "$dev_client_runtime" != 'custom' ]]; then
  printf 'Expo returned runtime %s instead of a development client URL. Check expo-dev-client and Expo CLI configuration.\n' \
    "$dev_client_runtime" >&2
  exit 1
fi
if [[ "$manifest_url" != "$metro_base_url"* ]]; then
  printf 'Expo returned a dev-client manifest URL outside the selected Metro server: %s\n' "$manifest_url" >&2
  exit 1
fi
if ! timeout 8s adb -s "$test_device" shell nc -z -w 5 localhost "$metro_port" \
  > "$artifact_dir/adb-metro-probe.txt" 2>&1; then
  printf 'The selected device cannot reach Metro through adb reverse on port %s. See %s/adb-metro-probe.txt.\n' \
    "$metro_port" "$artifact_dir" >&2
  exit 1
fi
printf 'Device reached Metro through adb reverse on port %s.\n' "$metro_port" \
  >> "$artifact_dir/adb-metro-probe.txt"
intent_handler="$(adb -s "$test_device" shell cmd package resolve-activity --brief \
  -a android.intent.action.VIEW -d "$dev_client_url" 2>&1 | tr -d '\r' || true)"
if [[ "$intent_handler" != *"$app_id"* ]]; then
  printf 'The installed app on %s does not resolve the Expo dev-client URL. URL: %s; resolver: %s\n' \
    "$test_device" "$dev_client_url" "${intent_handler:-no activity resolved}" >&2
  exit 1
fi

printf '%s\n' \
  "device=$test_device" \
  "metro=$metro_base_url" \
  "metro_manifest_url=$manifest_url" \
  "dev_client_url=$dev_client_url" \
  "app_scheme=$app_scheme" \
  "expo_config_app_id=$app_id" \
  "metro_native_project_app_id=$dev_server_app_id" \
  "metro_native_project_scheme=$expo_server_scheme" \
  "intent_handler=$intent_handler" > "$artifact_dir/dev-client-connection.txt"
if [[ "$dev_server_app_id" != "$app_id" ]]; then
  printf 'Expo reports native project app ID %s from the existing android/ tree; app.config.js and the selected installed app use %s. The URL resolves to the selected app.\n' \
    "$dev_server_app_id" "$app_id" >&2
fi
printf 'Expo dev client URL is ready: %s\n' "$dev_client_url"

overall_status=0
for flow_file in "${flow_files[@]}"; do
  flow_name="$(basename "$flow_file" .yaml)"
  if ! adb -s "$test_device" get-state 2>/dev/null | grep -qx 'device'; then
    printf 'Selected Android device %s is no longer connected; stopping before %s.\n' \
      "$test_device" "$flow_name" >&2
    overall_status=1
    break
  fi

  if [[ "$preserve_app_data" == 1 ]]; then
    adb -s "$test_device" shell am force-stop "$app_id" \
      > "$artifact_dir/reset-$flow_name.txt" 2>&1 || true
    printf 'Preserving %s app data for %s.\n' "$app_id" "$flow_name"
  else
    if ! adb -s "$test_device" shell pm clear "$app_id" \
      > "$artifact_dir/reset-$flow_name.txt" 2>&1; then
      printf 'Could not clear app data before %s. See %s/reset-%s.txt.\n' \
        "$flow_name" "$artifact_dir" "$flow_name" >&2
      overall_status=1
      continue
    fi
    if ! grep -q 'Success' "$artifact_dir/reset-$flow_name.txt"; then
      printf 'App data reset did not report success before %s. See %s/reset-%s.txt.\n' \
        "$flow_name" "$artifact_dir" "$flow_name" >&2
      overall_status=1
      continue
    fi
  fi

  maestro_args=(
    test
    --format JUNIT
    --output "$artifact_dir/results-$flow_name.xml"
    --debug-output "$artifact_dir/debug/$flow_name"
    --flatten-debug-output
    --test-output-dir "$artifact_dir/run/$flow_name"
    --udid "$test_device"
    --env "MAESTRO_DEV_CLIENT_URL=$dev_client_url"
    --env "MAESTRO_METRO_URL=$manifest_url"
  )
  printf 'Running %s on %s.\n' "$flow_file" "$test_device"
  maestro "${maestro_args[@]}" "$flow_file" 2>&1 | tee "$artifact_dir/maestro-$flow_name.log"
  flow_status=${PIPESTATUS[0]}
  if [[ "$flow_status" -ne 0 ]]; then
    overall_status="$flow_status"
  fi
done
exit "$overall_status"
