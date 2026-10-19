// Jest's native export conditions select Lucide's ESM build; exercise its real CommonJS build.
jest.mock('lucide-react-native', () =>
  jest.requireActual('../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js')
)
jest.mock('uniwind', () => ({ useCSSVariable: jest.fn(() => '#2D2235') }))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { Svg } = require('react-native-svg')
const { useCSSVariable } = require('uniwind')
const { Check, Play } = require('../../components/ui/icons')

function renderIcon(Icon, props, foreground = '#2D2235') {
  useCSSVariable.mockReturnValue(foreground)
  let renderer
  act(() => {
    renderer = create(React.createElement(Icon, props))
  })
  const svg = renderer.root.findByType(Svg).props
  act(() => renderer.unmount())
  return svg
}

test('uses the Cadence foreground fallback and preserves SVG sizing', () => {
  const svg = renderIcon(Check, { size: 20, strokeWidth: 3 })
  expect(svg.stroke).toBe('#2D2235')
  expect(svg.width).toBe(20)
  expect(svg.height).toBe(20)
  expect(svg.strokeWidth).toBe(3)
})

test('preserves explicit SVG props and numeric size', () => {
  const svg = renderIcon(Play, { color: '#123456', size: 19, accessibilityLabel: 'Start' })
  expect(svg.stroke).toBe('#123456')
  expect(svg.width).toBe(19)
  expect(svg.accessibilityLabel).toBe('Start')
})

test('uses the active CSS theme foreground when no color is supplied', () => {
  const svg = renderIcon(Check, {}, '#FAF7FC')
  expect(svg.stroke).toBe('#FAF7FC')
  expect(svg.width).toBe(24)
})
