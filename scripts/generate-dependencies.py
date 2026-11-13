#!/usr/bin/env python3
"""Generate the offline list from the repository's checked-in lockfiles."""
import json
import re
import tomllib
from pathlib import Path

root = Path(__file__).resolve().parent.parent
entries = set()
lock = (root / 'yarn.lock').read_text()
headers = re.findall(r'^([^\n]+):\n  version "([^"]+)"', lock, re.MULTILINE)
assert len(headers) == len(re.findall(r'^[^\s#][^\n]*:$', lock, re.MULTILINE))
for header, version in headers:
    names = re.findall(r'(?:^|, )"?(@?[^@" ]+)@', header)
    if not names:
        raise ValueError(f'Unrecognized Yarn lock entry: {header}')
    entries.update(('JavaScript', name, version) for name in names)

cargo = tomllib.loads((root / 'Cargo.lock').read_text())
entries.update(('Rust', package['name'], package['version']) for package in cargo['package'] if 'source' in package)
assert any(ecosystem == 'JavaScript' and name == 'react-native' for ecosystem, name, _ in entries)
assert any(ecosystem == 'Rust' for ecosystem, _, _ in entries)
output = [{'ecosystem': ecosystem, 'name': name, 'version': version}
          for ecosystem, name, version in sorted(entries, key=lambda entry: (entry[0], entry[1].lower(), entry[2]))]
(root / 'apps/client/features/about/dependencies.json').write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n')
