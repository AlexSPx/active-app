const fs = require('fs')
const path = require('path')

const stylesheet = fs.readFileSync(path.resolve(__dirname, '../../global.css'), 'utf8')

test('Cadence semantic styles define usable controls, typography, and surfaces', () => {
  expect(stylesheet).toContain('--spacing-touch: 44px')
  expect(stylesheet).toContain('--spacing-action: 48px')
  expect(stylesheet).toContain('--text-screen-title: 26px')
  expect(stylesheet).toContain("--font-dm-sans: 'DM Sans'")
  expect(stylesheet).toContain('--color-accent: #624572')
  expect(stylesheet).toContain('--color-on-accent: #faf5fc')
})

test('light and dark themes define the shared semantic color contract', () => {
  const semanticColors = [
    'background',
    'foreground',
    'muted',
    'surface',
    'raised',
    'divider',
    'accent',
    'on-accent',
    'destructive',
  ]

  for (const color of semanticColors) {
    expect(stylesheet).toMatch(new RegExp(`--color-${color}:\\s*#[a-f0-9]{6}`, 'i'))
  }
  expect(stylesheet).toContain('@variant light')
  expect(stylesheet).toContain('@variant dark')
})
