# Local Qwen coach SFT

The production comparison runs the client’s constrained turn handler, conversation assembly, schemas and 876-entry exercise catalog. llama-server runs the shipped Q8_0 GGUF, uses its embedded template with thinking disabled, and applies the same seed, temperature and token caps to every model. Candidates use the same GGUF with a separate adapter. The native mobile runtime is outside this harness.

The app chooses intent, asks Qwen for coaching text or one exercise name per workout slot, and then fills in sets, reps, rest, and progression guidance itself. Some schedule, setup, and safety decisions return before the model runs. The evaluator includes those decisions. Fixture history and an empty saved-workout library remove dependencies on personal data. The app diagnostics in the raw development output report whether the model was invoked.

The locally available trainable checkpoint was reconstructed by dequantizing the production Q8 text tensors into sharded BF16 weights under the pinned Hugging Face config and copying the embedded production template. The QLoRA trainer quantizes the reconstructed text weights to NF4, masks the full input, verifies the decoded supervised suffix, and checkpoints optimizer, random state, and adapter weights every four updates. Comparing the native candidate attaches only the trained delta to the original Q8 GGUF. The original GGUF stays intact.

## Run

Use the existing Node 24 and Python environments, llama.cpp CUDA build, and local model paths at the top of `run.sh`. Override paths with the environment variables defined there. The run directory defaults to `~/.local/share/active-coach-tuning/teacher-20261125`.

```bash
tools/coach-sft/run.sh baseline
tools/coach-sft/run.sh anchor
tools/coach-sft/run.sh smoke
tools/coach-sft/run.sh round 1 tools/coach-sft/round1-source.jsonl --epochs 1
tools/coach-sft/run.sh decide 1
```

Run the same round command with the same arguments to resume. Round 2 continued from the promoted Round 1 checkpoint with one epoch and a learning rate of 0.0002.

```bash
run="$HOME/.local/share/active-coach-tuning/teacher-20261125"
tools/coach-sft/run.sh round 2 tools/coach-sft/round2-source.jsonl \
  --from-adapter "$run/round-1/adapter" --lr 0.0002 --epochs 1
tools/coach-sft/run.sh decide 2
tools/coach-sft/run.sh round 3 tools/coach-sft/round3-source.jsonl \
  --from-adapter "$run/round-1/adapter" --lr 0.0003 --epochs 2 --focus-on-answers
tools/coach-sft/run.sh decide 3
tools/coach-sft/run.sh round 4 tools/coach-sft/round4-source.jsonl \
  --from-adapter "$run/round-2/adapter" --lr 0.00015 --epochs 2 --focus-on-answers
tools/coach-sft/run.sh decide 4
tools/coach-sft/run.sh round 5 tools/coach-sft/round5-source.jsonl \
  --from-adapter "$run/round-4/adapter" --lr 0.0002 --epochs 2 --focus-on-answers
tools/coach-sft/run.sh decide 5
tools/coach-sft/run.sh round 6 tools/coach-sft/round6-source.jsonl \
  --from-adapter "$run/round-5/adapter" --lr 0.00018 --epochs 2 --focus-on-answers
tools/coach-sft/run.sh decide 6
```
To reproduce from scratch, use a new `COACH_SFT_RUN` directory and copy the frozen acceptance inputs into its private subdirectory before training. Preserve the grader outputs for exact score reproduction. Hardware kernels and independent model-based grading can vary across fresh runs.

Use an independent blind grader for each evaluation. Copy the matching `blind.jsonl` to a neutral path before handing it to a grader and provide `rubric.md`. Keep checkpoint and round names out of the assignment. Have the grader save `grades.jsonl` alongside the input, with code, quality, critical, and reason fields. The baseline scorer writes the baseline details for the promotion ledger.

```bash
run="$HOME/.local/share/active-coach-tuning/teacher-20261125"
python3 tools/coach-sft/grade.py score "$run/baseline.jsonl" "$run/baseline-blind" \
  --details "$run/baseline-details.json" > "$run/baseline-score.json"
```

Keep acceptance in the private run directory. The duplicate screen reads that file without printing held-out rows. It compares normalized strings and word overlap, so teacher review still matters for semantic overlap. Once the ledger says acceptance is pending, run `tools/coach-sft/run.sh acceptance`, submit its private blind file to an independent grader, and rerun the same command to finalize the aggregate. The command resumes an interrupted inference run from existing case rows. It does not generate any acceptance replies after the aggregate is finalized.

The promotion report reuses the first blind verdict when both the case and the displayed reply are identical across runs. Distinct replies keep their own verdicts. The run directory retains the initial verdicts. The comparison was regraded in shuffled batches from neutral paths because the original input paths contained checkpoint history. The stopping counter records rounds with a meaningful gain even when a material regression prevents promotion.

The six-round cap applied to the initial run. The user reopened it from the retained Round 5 adapter. The continuation removes both round-count stops. The development and acceptance cases, scoring thresholds, and promotion rules still apply.

```bash
run="$HOME/.local/share/active-coach-tuning/teacher-20261125"
tools/coach-sft/run.sh round 7 tools/coach-sft/round7-source.jsonl \\
  --from-adapter "$run/round-5/adapter" --lr 0.0001 --epochs 1 --focus-on-answers
tools/coach-sft/run.sh decide 7
```

Round 8 used more workout examples and continued from Round 5:

```bash
tools/coach-sft/run.sh round 8 tools/coach-sft/round8-source.jsonl \\
  --from-adapter "$run/round-5/adapter" --lr 0.00006 --epochs 2 --focus-on-answers
tools/coach-sft/run.sh decide 8
```

Round 8 was scored on the original planner. The subsequent planner fixes have a separate same-planner comparison for the base and the retained Round 8 adapter. That comparison is the reference starting with Round 9. For a fresh inference replay with the current planner, use new output filenames:

```bash
tools/coach-sft/run.sh eval-dev "$run/planner-comparison/baseline-replay.jsonl"
tools/coach-sft/run.sh eval-dev "$run/planner-comparison/adapter-replay.jsonl" \\
  --lora "$run/round-8/adapter.gguf"
```

Round 9 used the schedule-parser comparison as its reference. The later comparison in `catalog-equipment-comparison` includes the newly reviewed bench press, pulldown and HIIT movement. Its baseline and incumbent scores are used for subsequent promotions. The generated catalog artifact retains its pinned contents. Coach catalog metadata identifies Mountain Climbers as bodyweight after setup review.

```bash
tools/coach-sft/run.sh round 10 tools/coach-sft/round10-source.jsonl \\
  --from-adapter "$run/round-8/adapter" --lr 0.0001 --epochs 1 --focus-on-answers
tools/coach-sft/run.sh decide 10
```

After a planner change, use `eval-dev` to capture base and incumbent results into a new comparison directory. Write the incumbent's round directory name to `checkpoint.txt`. Run `compare_planner.py prepare RUN DIRECTORY` to produce a neutral packet for new replies, then run `compare_planner.py apply RUN DIRECTORY` after blind grading to record the comparison in the ledger.

The current app uses the `coverage-comparison` patch and leaves Round 8 as the incumbent. The grounding-prompt and movement-slot rotation experiments have their own comparison directories and were reverted. Round 12 trained with additional weight on final follow-up replies:

```bash
tools/coach-sft/run.sh round 12 tools/coach-sft/round12-source.jsonl \\
  --from-adapter "$run/round-8/adapter" --lr 0.000035 --epochs 1 --focus-on-answers --focus-on-followups
tools/coach-sft/run.sh decide 12
```

The ledger records the final development feasibility audit. The workout grader failed all five legal exercise selections across two equipment-limited cases. Three other frozen cases require a clarification or refusal that the blind quality rubric then rejects in the observed outputs. The acceptance set remains frozen and unrun.

## Development version 2

Set `COACH_SFT_DEV_VERSION=2` for the current development checks. Version 2 keeps the same requests and quality rubric. It checks that a set range yields a draft within the requested range and that six sets of eight yields those exact values. Version 1 files and historical scores are retained. The private acceptance set keeps its original case version.

```bash
run="$HOME/.local/share/active-coach-tuning/teacher-20261125"
export COACH_SFT_DEV_VERSION=2
tools/coach-sft/run.sh round 13 tools/coach-sft/round13-source.jsonl \\
  --from-adapter "$run/round-8/adapter" --lr 0.00006 --epochs 1 --focus-on-answers --focus-on-followups
tools/coach-sft/run.sh decide 13
tools/coach-sft/run.sh round 14 tools/coach-sft/round14-source.jsonl \\
  --from-adapter "$run/round-8/adapter" --lr 0.00002 --epochs 1 --focus-on-answers --focus-on-followups
tools/coach-sft/run.sh decide 14
```

The `endurance-v2-comparison` directory contains the verified development-gate pass for the retained app and Round 8 adapter. Its `app.patch` captures the app revision used. The acceptance command resumes from saved case receipts if interrupted and returns the recorded aggregate after grading:

```bash
COACH_SFT_DEV_VERSION=2 tools/coach-sft/run.sh acceptance
```

## Generalization run

Development version 3 is a new frozen 32-case panel. The original run and its recorded acceptance result remain separate. The generalization run uses a newly sealed acceptance panel and compares candidates against base Qwen and the existing Round 8 adapter on the same app revision.

```bash
export COACH_SFT_DEV_VERSION=3
export COACH_SFT_RUN="$HOME/.local/share/active-coach-tuning/teacher-20261125/generalization-v3"
tools/coach-sft/run.sh round 2 tools/coach-sft/generalization-round2-source.jsonl \\
  --from-adapter "$COACH_SFT_RUN/round-1/adapter" --lr 0.00008 --epochs 1 --focus-on-answers
tools/coach-sft/run.sh decide 2
```

The runner keeps the final app comparison in `final-v3`. The original Round 8 adapter is referenced as `round-1` in this run. Candidate 2 was retained for analysis after its promotion failed.
