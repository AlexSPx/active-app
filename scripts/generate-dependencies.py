#!/usr/bin/env python3
"""Generate the lockfile snapshot; use --fetch to retrieve missing registry metadata."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import re
import sys
import tomllib
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'apps/client/features/about/dependencies.json'


def yarn_entries(lock):
    headers = re.findall(r'^([^\n]+):\n  version "([^"]+)"', lock, re.MULTILINE)
    if len(headers) != len(re.findall(r'^[^\s#][^\n]*:$', lock, re.MULTILINE)):
        raise ValueError('Unrecognized Yarn lock entry')
    entries = set()
    for header, version in headers:
        for selector in header.split(', '):
            match = re.fullmatch(r'"?(@?[^@" ]+)@([^"]+)"?', selector)
            if not match:
                raise ValueError(f'Unrecognized Yarn selector: {selector}')
            name, specifier = match.groups()
            alias = re.fullmatch(r'npm:(@?[^@]+)@.+', specifier)
            entries.add(('JavaScript', name, version, alias.group(1) if alias else name))
    return entries


def package_url(ecosystem, package, version):
    if ecosystem == 'JavaScript':
        return f'https://www.npmjs.com/package/{quote(package, safe="@/")}/v/{quote(version, safe="")}'
    return f'https://crates.io/crates/{quote(package, safe="")}/{quote(version, safe="")}'


def parse_metadata(ecosystem, package, version, data):
    record = data if ecosystem == 'JavaScript' else data.get('version', {})
    name_key, version_key = ('name', 'version') if ecosystem == 'JavaScript' else ('crate', 'num')
    if record.get(name_key) != package or record.get(version_key) != version:
        raise ValueError(f'Registry returned mismatched metadata for {package}@{version}')
    license_value = record.get('license')
    return license_value.strip() if isinstance(license_value, str) and license_value.strip() else None


def fetch_license(entry):
    ecosystem, _, version, package = entry
    if ecosystem == 'JavaScript':
        url = f'https://registry.npmjs.org/{quote(package, safe="")}/{quote(version, safe="")}'
    else:
        url = f'https://crates.io/api/v1/crates/{quote(package, safe="")}/{quote(version, safe="")}'
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
    parser.add_argument('--fetch', action='store_true', help='fetch missing exact-version metadata from npm and crates.io')
    args = parser.parse_args()
    entries = yarn_entries((ROOT / 'yarn.lock').read_text())
    cargo = tomllib.loads((ROOT / 'Cargo.lock').read_text())
    for package in cargo['package']:
        if 'source' in package:
            if package['source'] != 'registry+https://github.com/rust-lang/crates.io-index':
                raise ValueError(f"Unsupported Cargo source: {package['source']}")
            entries.add(('Rust', package['name'], package['version'], package['name']))
    if not any(e[0] == 'JavaScript' and e[1] == 'react-native' for e in entries) or not any(e[0] == 'Rust' for e in entries):
        raise ValueError('Expected JavaScript and Rust dependencies')
    old = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else []
    cache = {(e['ecosystem'], e['name'], e['version'], e.get('package', e['name'])): e['license']
             for e in old if 'license' in e}
    missing = sorted(entries - cache.keys())
    if missing and not args.fetch:
        raise ValueError(f'{len(missing)} dependencies lack cached metadata; rerun with --fetch')
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
    OUTPUT.write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n')
    print(f'Generated {len(output)} dependencies; {sum(e["license"] is None for e in output)} licenses unknown.', file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        sys.exit(f'Cannot generate dependencies: {error}')
