"""Check the mock record's rendered Android bounds and divider pixels.

Usage: python3 scripts/verify-history-preview.py snapshot.json screenshot.png
Requires Pillow for reading the screenshot.
"""

import json
import sys
from PIL import Image

nodes = json.load(open(sys.argv[1]))['data']['nodes']
image = Image.open(sys.argv[2]).convert('RGB')


def matches(label):
    return [node['rect'] for node in nodes if node.get('label') == label]


def one(label):
    values = matches(label)
    assert len(values) == 1, f'Expected one visible {label!r}, got {len(values)}'
    return values[0]


def aligned(header, values):
    headings = matches(header)
    assert headings, f'Missing {header} column'
    for label in values:
        cells = matches(label)
        assert cells, f'Missing {label} values'
        for cell in cells:
            assert any(abs(cell['x'] - heading['x']) <= 1 for heading in headings), (
                f'{header} column is misaligned at {label}: {cell}'
            )


aligned('Set', ['1', '2', '3'])
aligned('Weight (kg)', ['70', '20'])
aligned('Reps', ['8', '10'])
subtitle = one('A session in the books.')
metrics = [one(label) for label in ['38', '6', '2,280']]
assert metrics[0]['y'] - (subtitle['y'] + subtitle['height']) >= subtitle['height'], (
    'Missing space above summary stats'
)
heading = one('Recorded sets')
exercise = one('Barbell full squat')
assert exercise['y'] - (heading['y'] + heading['height']) >= heading['height'] * 0.8, (
    'Missing space between Recorded sets and the exercise title'
)

# The fixed dark preview must show both continuous vertical summary dividers.
centers = [metric['x'] + metric['width'] / 2 for metric in metrics]
top = metrics[0]['y']
bottom = one('minutes')['y'] + one('minutes')['height']
for left, right in zip(centers, centers[1:]):
    center = round((left + right) / 2)
    pixels = sum(
        any(
            max(abs(a - b) for a, b in zip(image.getpixel((x, y)), (81, 65, 93))) <= 16
            for x in range(center - 2, center + 3)
        )
        for y in range(top, bottom)
    )
    assert pixels >= (bottom - top) * 0.7, f'Missing summary divider near x={center}'

print('PASS: native table columns, section spacing, and summary dividers')
