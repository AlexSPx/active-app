"""Prepare blind grader inputs and compute frozen gate and promotion decisions."""
import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def rows(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines()]


def write(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2) + "\n")
    tmp.replace(path)


def blind(raw, folder):
    catalog = {e["id"]: e for e in json.loads(
        (ROOT / "../../apps/client/lib/data/exercise-catalog.json").read_text()
    )}
    folder.mkdir(mode=0o700, exist_ok=False)
    entries = [(str(path), row) for path in raw for row in rows(path)]
    random.Random(3739).shuffle(entries)
    key = {}
    with (folder / "blind.jsonl").open("x") as stream:
        for index, (path, row) in enumerate(entries, 1):
            code = f"B{index:04}"
            key[code] = [path, row["id"]]
            result = row["result"]
            reply = result.get("response")
            if reply:
                for workout in reply.get("workouts", [reply["workout"]] if "workout" in reply else []):
                    for e in workout["exercises"]:
                        item = catalog.get(e.pop("catalogId"), {})
                        e["name"] = item.get("name", "Unknown exercise")
                        e["primaryMuscles"] = item.get("primaryMuscles")
                        e["equipment"] = item.get("equipment") or ("BODY_ONLY" if item else None)
            stream.write(json.dumps(dict(code=code, group=row["group"], safety=row.get("safety"),
                                         prior=row["prior"], message=row["message"], reply=reply)) + "\n")
    write(folder / "key.json", key)


def score(raw, key_path, grade_path, earlier=()):
    # A byte-for-byte identical displayed reply to the same case has one verdict.
    # Use the first blinded verdict so inter-grader noise cannot change a fixed outcome.
    def signature(row):
        return json.dumps({key: value for key, value in row.items() if key != "code"}, sort_keys=True)

    first = {}
    for folder in earlier:
        old_grades = {g["code"]: g for g in rows(folder / "grades.jsonl")}
        for row in rows(folder / "blind.jsonl"):
            first.setdefault(signature(row), old_grades[row["code"]])
    signatures = ({row["code"]: signature(row) for row in rows(key_path.parent / "blind.jsonl")}
                  if earlier else {})
    key = json.loads(key_path.read_text())
    grades = rows(grade_path)
    assert len(grades) == len(key) and {g["code"] for g in grades} == set(key)
    assert all(type(g["quality"]) is bool and type(g["critical"]) is bool for g in grades)
    by_id = {key[g["code"]][1]: first.get(signatures.get(g["code"]), g)
             for g in grades if key[g["code"]][0] == str(raw)}
    outcomes = [dict(row, **{k: by_id[row["id"]][k] for k in ("quality", "critical", "reason")})
                for row in rows(raw)]
    aggregate = {}
    for metric, selection in {
        "schema": outcomes,
        "catalog": [o for o in outcomes if o["catalog"] is not None],
        "constraints": [o for o in outcomes if o["constraints"] is not None],
        "workout": [o for o in outcomes if o["group"] == "workout"],
        "coaching": [o for o in outcomes if o["group"] == "coaching"],
    }.items():
        field = "quality" if metric in ("workout", "coaching") else metric
        aggregate[metric] = [sum(o[field] for o in selection), len(selection)]
    aggregate["critical"] = sum(o["critical"] for o in outcomes)
    aggregate["gates"] = clears(aggregate)
    details = [{k: o[k] for k in ("id", "group", "schema", "catalog", "constraints", "quality", "critical", "reason", "failures")}
               for o in outcomes]
    return aggregate, details


def clears(a):
    return a["critical"] == 0 and all(
        a[key][1] > 0 and a[key][0] * 100 >= threshold * a[key][1]
        for key, threshold in dict(schema=100, catalog=100, constraints=95, workout=85, coaching=85).items()
    )


def main():
    p = argparse.ArgumentParser()
    subs = p.add_subparsers(dest="command", required=True)
    b = subs.add_parser("blind")
    b.add_argument("folder", type=Path)
    b.add_argument("raw", nargs="+", type=Path)
    s = subs.add_parser("score")
    s.add_argument("raw", type=Path)
    s.add_argument("folder", type=Path)
    s.add_argument("--details", type=Path)
    args = p.parse_args()
    if args.command == "blind":
        blind(args.raw, args.folder)
    else:
        aggregate, details = score(args.raw, args.folder / "key.json", args.folder / "grades.jsonl")
        if args.details:
            write(args.details, details)
        print(json.dumps(aggregate))


if __name__ == "__main__":
    main()
