#!/usr/bin/env python3
"""Generate the lockfile snapshot; use --fetch to retrieve missing registry metadata."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import re
import sys
import shlex
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'apps/client/features/about/dependencies.json'


def yarn_entries(lock, roots, resolutions=None):
    blocks = re.split(r'\n(?=\S)', lock)
    selectors = {}
    for block in blocks:
        if not block or block.startswith('#'):
            continue
        lines = block.splitlines()
        if not lines[0].endswith(':'):
            raise ValueError(f'Unrecognized Yarn entry: {lines[0]}')
        version_match = re.search(r'^  version "([^"]+)"$', block, re.MULTILINE)
        if not version_match:
            raise ValueError(f'Missing Yarn version: {lines[0]}')
        children = []
        section = None
        for line in lines[1:]:
            if line.startswith('  ') and not line.startswith('    '):
                section = line.strip().removesuffix(':') if line.endswith(':') else None
            elif line.startswith('    ') and section in ('dependencies', 'optionalDependencies'):
                parts = shlex.split(line.strip())
                if len(parts) != 2:
                    raise ValueError(f'Unrecognized Yarn dependency: {line}')
                children.append(tuple(parts))
        for selector in lines[0][:-1].split(', '):
            selector = selector.strip('"')
            match = re.fullmatch(r'(@?[^@" ]+)@(.+)', selector)
            if not match:
                raise ValueError(f'Unrecognized Yarn selector: {selector}')
            name, specifier = match.groups()
            alias = re.fullmatch(r'npm:(@?[^@]+)@.+', specifier)
            entry = ('JavaScript', name, version_match.group(1), alias.group(1) if alias else name)
            selectors[selector] = (entry, children)
    entries = set()
    visited = set()
    pending = list(roots.items())
    while pending:
        name, specifier = pending.pop()
        selector = f'{name}@{specifier}'
        if resolutions and name in resolutions:
            selector = f'{name}@{resolutions[name]}'
        if selector in visited:
            continue
        visited.add(selector)
        if selector not in selectors:
            raise ValueError(f'Missing Yarn selector: {selector}')
        entry, children = selectors[selector]
        entries.add(entry)
        pending.extend(children)
    return entries


def package_url(ecosystem, package, version):
    return f'https://www.npmjs.com/package/{quote(package, safe="@/")}/v/{quote(version, safe="")}'


def parse_metadata(ecosystem, package, version, data):
    record = data
    if record.get('name') != package or record.get('version') != version:
        raise ValueError(f'Registry returned mismatched metadata for {package}@{version}')
    license_value = record.get('license')
    return license_value.strip() if isinstance(license_value, str) and license_value.strip() else None


def fetch_license(entry):
    ecosystem, _, version, package = entry
    url = f'https://registry.npmjs.org/{quote(package, safe="")}/{quote(version, safe="")}'
    request = Request(url, headers={'User-Agent': 'active-app-dependency-attribution (https://github.com/AlexSPx/active-app)'})
    try:
        with urlopen(request, timeout=30) as response:
            return parse_metadata(ecosystem, package, version, json.load(response))
    except HTTPError as error:
        if error.code == 404:
            return None
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--fetch', action='store_true', help='fetch missing exact-version metadata from npm')
    mode.add_argument('--check', action='store_true', help='check without writing; regenerate with python3 scripts/generate-dependencies.py --fetch')
    args = parser.parse_args()
    client = json.loads((ROOT / 'apps/client/package.json').read_text())
    root = json.loads((ROOT / 'package.json').read_text())
    entries = yarn_entries((ROOT / 'yarn.lock').read_text(), client['dependencies'], root.get('resolutions'))
    if not any(e[1] == 'react-native' for e in entries):
        raise ValueError('Expected React Native dependency')
    old = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else []
    cache = {(e['ecosystem'], e['name'], e['version'], e.get('package', e['name'])): e['license']
             for e in old if 'license' in e}
    missing = sorted(entries - cache.keys())
    if missing and not args.fetch:
        raise ValueError(f'{len(missing)} dependencies lack cached metadata; run python3 scripts/generate-dependencies.py --fetch')
    if missing:
        print(f'Fetching metadata for {len(missing)} dependency versions...', file=sys.stderr, flush=True)
        with ThreadPoolExecutor(max_workers=8) as pool:
            for entry, license_value in zip(missing, pool.map(fetch_license, missing)):
                cache[entry] = license_value
    output = []
    for ecosystem, name, version, package in sorted(entries, key=lambda e: (e[0], e[1].lower(), e[2], e[3])):
        item = {'ecosystem': ecosystem, 'name': name, 'version': version}
        if package != name:
            item['package'] = package
        item['license'] = cache[(ecosystem, name, version, package)]
        item['url'] = package_url(ecosystem, package, version)
        output.append(item)
    content = json.dumps(output, indent=2, ensure_ascii=False) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != content:
            raise ValueError('Dependency snapshot is stale; run python3 scripts/generate-dependencies.py --fetch')
        print(f'Dependency snapshot is up to date ({len(output)} dependencies).', file=sys.stderr)
        return
    OUTPUT.write_text(content)
    print(f'Generated {len(output)} dependencies; {sum(e["license"] is None for e in output)} licenses unknown.', file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        sys.exit(f'Cannot generate dependencies: {error}')
