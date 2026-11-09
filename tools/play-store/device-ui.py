#!/usr/bin/env python3
"""Small ADB helper for reviewing and capturing the real Android UI."""
import argparse
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def run(*args):
    return subprocess.check_output(['adb', *args], text=True)


def layout():
    run('shell', 'uiautomator', 'dump', '/sdcard/active-store-window.xml')
    return ET.fromstring(run('shell', 'cat', '/sdcard/active-store-window.xml'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['dump', 'tap', 'open', 'capture'])
    parser.add_argument('value', nargs='?')
    parser.add_argument('--package', default='com.alexspx.activenext')
    args = parser.parse_args()
    if args.action == 'dump':
        for node in layout().iter('node'):
            name = node.get('content-desc') or node.get('text')
            if name:
                print(name, node.get('bounds'))
    elif args.action == 'tap':
        nodes = [n for n in layout().iter('node') if args.value in [n.get('text'), n.get('content-desc')]]
        if not nodes:
            raise SystemExit(f'No visible element named {args.value!r}')
        nodes.sort(key=lambda n: n.get('clickable') != 'true')
        for node in nodes:
            x1, y1, x2, y2 = map(int, re.findall(r'-?\d+', node.get('bounds')))
            if x1 >= 0 and y1 >= 0 and x2 > x1 and y2 > y1:
                run('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
                time.sleep(1)
                return
        raise SystemExit('Element is outside the visible screen.')
    elif args.action == 'open':
        run('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'activenext://'+args.value, '-p', args.package)
        time.sleep(2)
    elif args.action == 'capture':
        path = Path(args.value)
        path.parent.mkdir(parents=True, exist_ok=True)
        time.sleep(1)
        path.write_bytes(subprocess.check_output(['adb', 'exec-out', 'screencap', '-p']))
        print(path)


if __name__ == '__main__':
    main()
