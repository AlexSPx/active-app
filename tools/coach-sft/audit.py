"""Screen candidate requests against the frozen splits without exposing held-out text."""
import argparse
import re
from difflib import SequenceMatcher
from pathlib import Path

from grade import rows


def normalized(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def prompt(row):
    return normalized(" ".join([*(turn if isinstance(turn, str) else turn["user"]
                                  for turn in row.get("prior", [])), row["message"]]))


def similarity(a, b):
    a_words, b_words = set(a.split()), set(b.split())
    return max(SequenceMatcher(None, a, b, autojunk=False).ratio(),
               len(a_words & b_words) / max(1, len(a_words | b_words)))


def main():
    import json
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("eval", nargs="+", type=Path)
    args = p.parse_args()
    held_out = [(prompt(row), normalized(row["message"])) for path in args.eval for row in rows(path)]
    kept = []
    known = []
    for row in rows(args.source):
        candidate, last = prompt(row), normalized(row["message"])
        if any(max(similarity(candidate, other), similarity(last, final)) >= .76 for other, final in held_out + known):
            continue
        known.append((candidate, last))
        kept.append(row)
    assert kept
    args.output.write_text("".join(json.dumps(row) + "\n" for row in kept))
    print(json.dumps({"retained": len(kept), "filtered": len(rows(args.source)) - len(kept)}))


if __name__ == "__main__":
    main()
