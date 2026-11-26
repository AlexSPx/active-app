"""Create provenance-free grading batches, then distribute verdicts to existing case maps."""
import argparse
import json
import random
from pathlib import Path

from grade import rows, write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["prepare", "apply"])
    parser.add_argument("output", type=Path)
    parser.add_argument("folders", type=Path, nargs="+")
    args = parser.parse_args()

    if args.stage == "prepare":
        entries = {}
        for folder in args.folders:
            for row in rows(folder / "blind.jsonl"):
                code = row.pop("code")
                key = json.dumps(row, sort_keys=True)
                if key not in entries:
                    entries[key] = (row, [])
                entries[key][1].append((str(folder), code))
        shuffled = list(entries.values())
        random.Random(16733).shuffle(shuffled)
        batches = [[], [], []]
        key = {}
        for index, (row, origins) in enumerate(shuffled):
            code = f"Q{index + 1:04}"
            batches[index % len(batches)].append(dict(code=code, **row))
            key[code] = origins
        args.output.mkdir(mode=0o700, exist_ok=False)
        for index, batch in enumerate(batches, 1):
            path = args.output / f"packet-{index}.jsonl"
            path.write_text("".join(json.dumps(row) + "\n" for row in batch))
            print(path, len(batch))
        write(args.output / "key.json", key)
    else:
        key = json.loads((args.output / "key.json").read_text())
        grades = [row for i in range(1, 4) for row in rows(args.output / f"verdicts-{i}.jsonl")]
        assert len(grades) == len(key) and {g["code"] for g in grades} == set(key)
        results = {str(folder): [] for folder in args.folders}
        for grade in grades:
            for folder, code in key[grade["code"]]:
                results[folder].append(dict(grade, code=code))
        for folder, verdicts in results.items():
            path = Path(folder) / "grades.jsonl"
            assert len(verdicts) == len(rows(Path(folder) / "blind.jsonl"))
            if path.exists() and not path.with_name("grades-prior.jsonl").exists():
                path.replace(path.with_name("grades-prior.jsonl"))
            tmp = path.with_suffix(".tmp")
            tmp.write_text("".join(json.dumps(grade) + "\n" for grade in verdicts))
            tmp.replace(path)


if __name__ == "__main__":
    main()
