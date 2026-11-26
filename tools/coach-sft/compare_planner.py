"""Compare base and incumbent after a planner change using the frozen development set."""
import argparse
import json
import secrets
import tempfile
from pathlib import Path

from grade import blind, rows, score, write


def signature(row):
    return json.dumps({key: value for key, value in row.items() if key != "code"}, sort_keys=True)


def prepare(run, directory, ledger):
    existing = [run / "baseline-blind", *(run / f"round-{round['round']}/blind" for round in ledger["rounds"])]
    previous = ledger.get("planner_comparison")
    if previous:
        earlier = run / previous.get("directory", "planner-comparison")
        existing.extend([earlier / "baseline-blind", earlier / "adapter-blind"])
    for receipt in sorted(run.glob("*/scores.json")):
        for name in ("baseline-blind", "adapter-blind"):
            folder = receipt.parent / name
            if (folder / "grades.jsonl").is_file() and folder not in existing:
                existing.append(folder)
    known = {}
    for folder in existing:
        grades = {g["code"]: g for g in rows(folder / "grades.jsonl")}
        for row in rows(folder / "blind.jsonl"):
            known.setdefault(signature(row), grades[row["code"]])

    novel = {}
    for name in ("baseline", "adapter"):
        folder = directory / f"{name}-blind"
        if not folder.exists():
            blind([directory / f"{name}.jsonl"], folder)
        ready = []
        for row in rows(folder / "blind.jsonl"):
            sig = signature(row)
            if sig in known:
                ready.append(dict(known[sig], code=row["code"]))
            else:
                novel.setdefault(sig, []).append((name, row["code"]))
        (folder / "reused.jsonl").write_text("".join(json.dumps(row) + "\n" for row in ready))
    neutral = Path(tempfile.mkdtemp(prefix="fitness-grade-"))
    shuffled = list(novel.items())
    secrets.SystemRandom().shuffle(shuffled)
    key = {}
    with (neutral / "items.jsonl").open("w") as stream:
        for index, (sig, origins) in enumerate(shuffled, 1):
            code = f"P{index:03}"
            key[code] = origins
            stream.write(json.dumps(dict(json.loads(sig), code=code)) + "\n")
    write(directory / "grade-map.json", key)
    (directory / "grader-location.txt").write_text(str(neutral) + "\n")
    print(neutral, len(key))


def apply(directory, ledger, report_only=False):
    key = json.loads((directory / "grade-map.json").read_text())
    neutral = Path((directory / "grader-location.txt").read_text().strip())
    fresh = rows(neutral / "verdicts.jsonl") if key else []
    assert len(fresh) == len(key) and {row["code"] for row in fresh} == set(key)
    output = {}
    for name in ("baseline", "adapter"):
        folder = directory / f"{name}-blind"
        grades = rows(folder / "reused.jsonl")
        for grade in fresh:
            grades.extend(dict(grade, code=code) for model, code in key[grade["code"]] if model == name)
        (folder / "grades.jsonl").write_text("".join(json.dumps(g) + "\n" for g in grades))
        result, details = score(directory / f"{name}.jsonl", folder / "key.json", folder / "grades.jsonl")
        output[name] = result
        write(directory / f"{name}-details.json", details)
    checkpoint = (directory / "checkpoint.txt").read_text().strip()
    if report_only:
        write(directory / "scores.json", output)
        print(json.dumps(output))
        return
    assert ledger["best"] == checkpoint and not ledger["stop"]
    ledger["planner_comparison"] = {
        "first_round": len(ledger["rounds"]) + 1, "checkpoint": checkpoint, "directory": directory.name, **output,
    }
    if output["adapter"]["gates"]:
        ledger["stop"] = "acceptance pending"
    write(directory / "scores.json", output)
    print(json.dumps(output))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["prepare", "apply"])
    parser.add_argument("run", type=Path)
    parser.add_argument("directory")
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    ledger_path = args.run / "ledger.json"
    ledger = json.loads(ledger_path.read_text())
    directory = args.run / args.directory
    if args.stage == "prepare":
        prepare(args.run, directory, ledger)
    else:
        apply(directory, ledger, args.report_only)
        if not args.report_only:
            write(ledger_path, ledger)


if __name__ == "__main__":
    main()
