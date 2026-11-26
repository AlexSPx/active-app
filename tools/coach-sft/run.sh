#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
tool=tools/coach-sft
run="${COACH_SFT_RUN:-$HOME/.local/share/active-coach-tuning/teacher-20261125}"
assets="${COACH_SFT_ASSETS:-$HOME/Documents/active/active-app}"
environment="${COACH_SFT_PYENV:-$HOME/.cache/active-coach-local-ft}"
llama="${COACH_SFT_LLAMA:-$HOME/.unsloth/llama.cpp}"
model="${COACH_SFT_MODEL:-$HOME/.cache/active-coach-cli/qwen3-5-2b-workouts-q8-0.gguf}"
port="${COACH_SFT_PORT:-18142}"
export PATH="$HOME/.nvm/versions/node/v24.6.0/bin:$PATH"
export NODE_PATH="$assets/node_modules"
site="$environment/lib/python3.11/site-packages/nvidia"
export LD_LIBRARY_PATH="$site/cuda_runtime/lib:$site/cublas/lib:/usr/local/lib/ollama/cuda_v12"
export OMP_NUM_THREADS=2 HF_HUB_OFFLINE=1 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True PYTHONDONTWRITEBYTECODE=1
py="$environment/bin/python"
tsx="$assets/node_modules/.bin/tsx"
mkdir -p "$run"
exec 9>"$run/.lock"
if ! flock -n 9; then
    echo "A coach run command is already using $run" >&2
    exit 1
fi
sha256sum -c "$tool/dev.freeze.sha256" >&2
dev_cases="$run/dev.jsonl"
if [[ ${COACH_SFT_DEV_VERSION:-1} == 3 ]]; then
    sha256sum -c "$tool/dev-v3.freeze.sha256" >&2
    dev_cases="$run/dev-v3.jsonl"
    cat "$tool/dev-v3-workout.jsonl" "$tool/dev-v3-coaching.jsonl" > "$dev_cases"
elif [[ ${COACH_SFT_DEV_VERSION:-1} == 2 ]]; then
    sha256sum -c "$tool/dev-v2.freeze.sha256" >&2
    dev_cases="$run/dev-v2.jsonl"
    cat "$tool/dev-v2-workout.jsonl" "$tool/dev-coaching.jsonl" > "$dev_cases"
else
    cat "$tool/dev-workout.jsonl" "$tool/dev-coaching.jsonl" > "$dev_cases"
fi

eval_cases() (
    local cases=$1 output=$2
    shift 2
    if [[ -s "$output" ]] && [[ $(wc -l < "$output") -eq $(wc -l < "$cases") ]]; then
        return
    fi
    if curl --silent --fail "http://127.0.0.1:$port/health" >/dev/null; then
        echo "Evaluation port $port is already occupied" >&2
        return 1
    fi
    "$llama/build/bin/llama-server" -m "$model" --host 127.0.0.1 --port "$port" -c 4096 -ngl 99 -np 1 "$@" > "$output.server.log" 2>&1 &
    local pid=$!
    trap 'kill "$pid" 2>/dev/null || true' EXIT
    for _ in {1..120}; do
        if curl --silent --fail "http://127.0.0.1:$port/health" >/dev/null; then break; fi
        kill -0 "$pid"
        sleep 1
    done
    "$tsx" "$tool/production.cjs" "$port" "$cases" "$output"
    kill "$pid"
    wait "$pid" || true
    trap - EXIT
)

case "$1" in
    baseline)
        eval_cases "$dev_cases" "$run/baseline.jsonl"
        if [[ ! -d "$run/baseline-blind" ]]; then
            "$py" "$tool/grade.py" blind "$run/baseline-blind" "$run/baseline.jsonl"
        fi
        ;;
    eval-dev)
        output=$2
        shift 2
        eval_cases "$dev_cases" "$output" "$@"
        ;;
    anchor)
        base="${COACH_SFT_BASE:-$HOME/.cache/huggingface/hub/models--unsloth--Qwen3.5-2B/snapshots/fffbc0d8711cf87df6d1f97938c5e50ef94aadc7}"
        PYTHONPATH="$llama/gguf-py" "$py" "$tool/anchor.py" "$base" "$model" "$run/anchor"
        ;;
    smoke)
        "$tsx" "$tool/compile.cjs" "$tool/smoke-source.jsonl" "$run/smoke-data.jsonl"
        "$py" -u "$tool/train.py" "$run/anchor" "$run/smoke-data.jsonl" "$run/smoke" --smoke
        ;;
    round)
        number=$2
        source=$3
        shift 3
        "$py" - "$run/ledger.json" "$number" <<'PYEND'
from pathlib import Path
import json
import sys
path, number = Path(sys.argv[1]), int(sys.argv[2])
ledger = json.loads(path.read_text()) if path.exists() else {"rounds": [], "stop": None}
assert number >= 1
assert number <= len(ledger["rounds"]) or (
    number == len(ledger["rounds"]) + 1 and not ledger["stop"]
), "Score the previous round or stop at the recorded gate"
PYEND
        target="$run/round-$number"
        mkdir -p "$target"
        if [[ ! -f "$target/train.jsonl" ]]; then
            (cd "$run/private"; sha256sum -c acceptance.sha256)
            cp "$source" "$target/source.jsonl"
            "$py" "$tool/audit.py" "$target/source.jsonl" "$target/screened.jsonl" "$dev_cases" "$run/private/acceptance.jsonl"
            "$tsx" "$tool/compile.cjs" "$target/screened.jsonl" "$target/train.jsonl" 2> "$target/rejected.log"
        fi
        "$py" -u "$tool/train.py" "$run/anchor" "$target/train.jsonl" "$target" "$@"
        if [[ ! -s "$target/adapter.gguf" ]]; then
            "$HOME/.unsloth/studio/unsloth_studio/bin/python" "$llama/convert_lora_to_gguf.py" \
                --base "$run/anchor" --outtype f16 --outfile "$target/adapter.partial.gguf" "$target/adapter" > "$target/export.log" 2>&1
            mv "$target/adapter.partial.gguf" "$target/adapter.gguf"
        fi
        eval_cases "$dev_cases" "$target/dev.jsonl" --lora "$target/adapter.gguf"
        if [[ ! -d "$target/blind" ]]; then
            "$py" "$tool/grade.py" blind "$target/blind" "$target/dev.jsonl"
        fi
        ;;
    acceptance)
        umask 077
        if [[ -s "$run/acceptance-aggregate.json" ]] && "$py" -c '
import json, sys
raise SystemExit(json.load(open(sys.argv[1]))["stop"] not in {"acceptance passed", "acceptance failed"})
' "$run/ledger.json"; then
            cat "$run/acceptance-aggregate.json"
            exit 0
        fi
        best=$("$py" -c 'import json, sys; d=json.load(open(sys.argv[1])); assert d["stop"] == "acceptance pending"; print(d["best"])' "$run/ledger.json")
        private="$run/private"
        if [[ ! -d "$private/evaluation" ]]; then
            (cd "$private"; sha256sum -c acceptance.sha256) >&2
            mkdir "$private/evaluation"
        fi
        if [[ ! -d "$private/evaluation/blind" ]]; then
            eval_cases "$private/acceptance.jsonl" "$private/evaluation/raw.jsonl" --lora "$run/$best/adapter.gguf" > "$private/evaluation/inference.log" 2>&1
            "$py" "$tool/grade.py" blind "$private/evaluation/blind" "$private/evaluation/raw.jsonl"
        fi
        grades="$private/evaluation/blind/grades.jsonl"
        if [[ -s "$grades" ]]; then
            "$py" "$tool/grade.py" score "$private/evaluation/raw.jsonl" "$private/evaluation/blind" > "$run/acceptance-aggregate.json"
            "$py" - "$run" <<'PYEND'
from pathlib import Path
import json
import sys
root = Path(sys.argv[1])
ledger = root / "ledger.json"
state = json.loads(ledger.read_text())
aggregate = json.loads((root / "acceptance-aggregate.json").read_text())
state["stop"] = "acceptance passed" if aggregate["gates"] else "acceptance failed"
temporary = ledger.with_suffix(".tmp")
temporary.write_text(json.dumps(state, indent=2) + "\n")
temporary.replace(ledger)
print(json.dumps(aggregate))
PYEND
        else
            echo "Acceptance grading is pending"
        fi
        ;;
    decide)
        shift
        "$py" "$tool/decide.py" "$run" "$@"
        ;;
    *)
        echo "Usage: $0 {baseline|eval-dev OUTPUT [LLAMA OPTIONS]|anchor|smoke|round NUMBER SOURCE [TRAIN OPTIONS]|decide NUMBER|acceptance}" >&2
        exit 2
        ;;
esac
