#!/usr/bin/env python3
"""Generate the shared client and server catalog from the pinned upstream file."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

REVISION = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5'
SHA256 = '5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf'
TARGET = Path(__file__).resolve().parents[1] / 'apps/client/lib/data/exercise-catalog.json'
URL = f'https://raw.githubusercontent.com/yuhonas/free-exercise-db/{REVISION}/dist/exercises.json'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='local copy of the pinned upstream file')
    parser.add_argument('--check', action='store_true', help='compare without writing')
    args = parser.parse_args()
    data = args.source.read_bytes() if args.source else urllib.request.urlopen(URL, timeout=30).read()
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError('upstream catalog SHA-256 does not match the pinned revision')
    source = json.loads(data)
    def enum(value):
        return value.upper().replace(' ', '_').replace('-', '_') if value is not None else None
    result = [{
        'id': 'local:exercise:' + row['id'], 'sourceKey': row['id'], 'name': row['name'],
        'level': enum(row['level']), 'force': enum(row['force']), 'mechanic': enum(row['mechanic']),
        'equipment': enum(row['equipment']), 'primaryMuscles': row['primaryMuscles'],
        'secondaryMuscles': row['secondaryMuscles'], 'instructions': row['instructions'],
        'category': enum(row['category']),
    } for row in source]
    if len({row['sourceKey'] for row in result}) != len(result):
        raise ValueError('duplicate source keys')
    if args.check:
        if json.loads(TARGET.read_text()) != result:
            raise SystemExit('bundled catalog differs from generated catalog')
    else:
        TARGET.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
