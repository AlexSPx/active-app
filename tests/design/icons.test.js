// Jest's native export conditions select Lucide's ESM build; exercise its real CommonJS build.
jest.mock('lucide-react-native', () =>
  jest.requireActual('../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js')
)

const React = require('react')
const { act, create } = require('react-test-renderer')
const { Svg } = require('react-native-svg')
const { TamaguiProvider } = require('tamagui')
const config = require('../../tamagui.config').default
const { Check, Play } = require('../../components/ui/icons')

function renderIcon(Icon, props, theme = 'dark') {
  let renderer
  act(() => {
    renderer = create(
      React.createElement(
        TamaguiProvider,
        { config, defaultTheme: theme },
        React.createElement(Icon, props)
      )
    )
  })
  const svg = renderer.root.findByType(Svg).props
  act(() => renderer.unmount())
  return svg
}

test('resolves Tamagui color and size tokens before rendering the native SVG', () => {
  const svg = renderIcon(Check, { color: '$primary', size: '$iconSmall', strokeWidth: 3 })
  expect(svg.stroke).toBe(config.themes.dark.primary.val)
  expect(svg.width).toBe(config.tokens.size.iconSmall.val)
  expect(svg.height).toBe(config.tokens.size.iconSmall.val)
  expect(svg.strokeWidth).toBe(3)
})

test('preserves explicit SVG props and numeric size', () => {
  const svg = renderIcon(Play, { color: '#123456', size: 19, accessibilityLabel: 'Start' })
  expect(svg.stroke).toBe('#123456')
  expect(svg.width).toBe(19)
  expect(svg.accessibilityLabel).toBe('Start')
})

test.each(['light', 'dark'])('uses the %s theme foreground when no color is supplied', (theme) => {
  const svg = renderIcon(Check, {}, theme)
  expect(svg.stroke).toBe(config.themes[theme].color.val)
  expect(svg.width).toBe(24)
})
