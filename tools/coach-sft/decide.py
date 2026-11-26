"""Record a round and apply the frozen promotion and stopping rules."""
import argparse
import json
from pathlib import Path

from grade import score, write


def compare(candidate, reference):
    before = {r["id"]: r for r in reference}
    assert set(before) == {r["id"] for r in candidate}
    structural, quality = [], {"workout": 0, "coaching": 0}
    fixed_constraints = fixed_safety = 0
    for row in candidate:
        old = before[row["id"]]
        for metric in ("schema", "catalog", "constraints"):
            if old[metric] is not False and row[metric] is False:
                structural.append(f"{row['id']} {metric}")
        if row["critical"] and not old["critical"]:
            structural.append(f"{row['id']} critical safety")
        fixed_constraints += row["constraints"] is True and old["constraints"] is False
        fixed_safety += old["critical"] and not row["critical"]
        quality[row["group"]] += int(row["quality"]) - int(old["quality"])
    return dict(quality=quality, fixed_constraints=fixed_constraints, fixed_safety=fixed_safety,
                material_regression=bool(structural) or min(quality.values()) <= -2, new_failures=structural)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("run", type=Path)
    p.add_argument("round", type=int)
    p.add_argument("--target", choices=["workout", "coaching", "both"], default="both")
    args = p.parse_args()
    run, number = args.run, args.round
    ledger_path = run / "ledger.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {
        "best": "baseline", "without_gain": 0, "rounds": [], "stop": None}
    if number <= len(ledger["rounds"]):
        print(json.dumps(ledger))
        return
    assert number == len(ledger["rounds"]) + 1 and not ledger["stop"]
    current = run / f"round-{number}"
    earlier = [run / "baseline-blind", *(run / f"round-{n}/blind" for n in range(1, number))]
    comparison = ledger.get("planner_comparison")
    if comparison and number >= comparison["first_round"]:
        comparison_dir = run / comparison.get("directory", "planner-comparison")
        earlier += [comparison_dir / "baseline-blind", comparison_dir / "adapter-blind"]
        baseline_path = comparison_dir / "baseline-details.json"
        incumbent_path = comparison_dir / "adapter-details.json" if ledger["best"] == comparison["checkpoint"] else run / ledger["best"] / "details.json"
    else:
        baseline_path = run / "baseline-details.json"
        incumbent_path = baseline_path if ledger["best"] == "baseline" else run / ledger["best"] / "details.json"
    aggregate, details = score(current / "dev.jsonl", current / "blind/key.json", current / "blind/grades.jsonl",
                               earlier=earlier)
    baseline = json.loads(baseline_path.read_text())
    incumbent = json.loads(incumbent_path.read_text())
    original, changes = compare(details, baseline), compare(details, incumbent)
    targeted = changes["quality"].values() if args.target == "both" else [changes["quality"][args.target]]
    gain = max(targeted) >= 2 or changes["fixed_constraints"] or changes["fixed_safety"]
    promote = bool(gain) and not (original["material_regression"] or changes["material_regression"])
    result = dict(round=number, target=args.target, aggregate=aggregate, versus_baseline=original,
                  versus_incumbent=changes, meaningful_gain=bool(gain), promoted=promote)
    write(current / "details.json", details)
    ledger["rounds"].append(result)
    if promote:
        ledger["best"] = current.name
    ledger["without_gain"] = 0 if gain else ledger["without_gain"] + 1
    if promote and aggregate["gates"]:
        ledger["stop"] = "acceptance pending"
    write(ledger_path, ledger)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
