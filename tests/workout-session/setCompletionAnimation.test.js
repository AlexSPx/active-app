const mockTimingCalls = []
const mockSharedValues = []
const mockPreferenceListeners = new Set()
// Keep these palettes in sync with the light/dark color tokens in global.css.
const mockThemes = {
  light: {
    background: '#faf7fc',
    foreground: '#2d2235',
    muted: '#76627e',
    surface: '#f0e9f5',
    raised: '#e9dff0',
    divider: '#dcd0e4',
    accent: '#624572',
    onAccent: '#faf5fc',
  },
  dark: {
    background: '#2d2235',
    foreground: '#faf5fc',
    muted: '#c0afcb',
    surface: '#382b42',
    raised: '#42314d',
    divider: '#51415d',
    accent: '#e3d7ee',
    onAccent: '#2d2235',
  },
}
let mockTheme = mockThemes.light
let mockReduceMotionEnabled = false

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: { Text: 'AnimatedText', View: 'AnimatedView' },
    cancelAnimation: jest.fn(),
    Easing: { cubic: (value) => value, out: (easing) => easing },
    interpolateColor: (value, inputRange, outputRange) => {
      const ratio = Math.max(
        0,
        Math.min(1, (value - inputRange[0]) / (inputRange[1] - inputRange[0]))
      )
      const channels = [0, 1, 2].map((index) => {
        const start = Number.parseInt(outputRange[0].slice(1 + index * 2, 3 + index * 2), 16) / 255
        const end = Number.parseInt(outputRange[1].slice(1 + index * 2, 3 + index * 2), 16) / 255
        const linear = Math.pow(start, 2.2) + (Math.pow(end, 2.2) - Math.pow(start, 2.2)) * ratio
        return Math.round(Math.pow(linear, 1 / 2.2) * 255)
      })
      return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, 1)`
    },
    useAnimatedStyle: (createStyle) => createStyle(),
    useReducedMotion: () => false,
    useSharedValue: (initialValue) => {
      const sharedValue = React.useRef(null)
      if (sharedValue.current === null) {
        sharedValue.current = { value: initialValue }
        mockSharedValues.push(sharedValue.current)
      }
      return sharedValue.current
    },
    withSequence: (...animations) => animations[animations.length - 1],
    withTiming: (toValue, config) => {
      mockTimingCalls.push({ toValue, config })
      return toValue
    },
  }
})

jest.mock('uniwind', () => ({
  useCSSVariable: (names) =>
    names.map((name) =>
      name === '--color-surface'
        ? mockTheme.surface
        : name === '--color-raised'
          ? mockTheme.raised
          : undefined
    ),
}))

jest.mock('../../components/ui/useReduceMotionPreference', () => {
  const React = require('react')
  return {
    useReduceMotionPreference: () => {
      const [enabled, setEnabled] = React.useState(mockReduceMotionEnabled)
      React.useEffect(() => {
        mockPreferenceListeners.add(setEnabled)
        return () => mockPreferenceListeners.delete(setEnabled)
      }, [])
      return enabled
    },
  }
})

jest.mock('../../components/ui', () => {
  const React = require('react')
  return {
    Button: (props) => React.createElement('Button', props, props.children),
    DurationTargetInput: (props) => React.createElement('DurationTargetInput', props),
    StrengthTargetInput: (props) => React.createElement('StrengthTargetInput', props),
    SwipeToDeleteRow: ({ children }) => children,
    useCadenceColors: () => mockTheme,
  }
})

jest.mock('../../components/ui/icons', () => ({
  Check: (props) => require('react').createElement('Check', props),
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { cancelAnimation } = require('react-native-reanimated')
const {
  WorkoutSessionSetRow,
} = require('../../features/workout-session/components/WorkoutSessionSetRow')
const {
  CardioSessionSetRow,
} = require('../../features/workout-session/components/CardioSessionSetRow')

const mockToggle = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
let updateHarnessSet

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  jest.clearAllMocks()
  mockTimingCalls.length = 0
  mockSharedValues.length = 0
  mockPreferenceListeners.clear()
  mockTheme = mockThemes.light
  mockReduceMotionEnabled = false
  updateHarnessSet = undefined
})

function SetRowHarness({ row: Row, initialSet }) {
  const [set, setSet] = React.useState(initialSet)
  updateHarnessSet = setSet

  const rowProps = {
    set,
    index: 0,
    canDelete: false,
    onToggleComplete: () => {
      mockToggle()
      setSet((current) => ({ ...current, completed: !current.completed }))
    },
    onDelete: mockDelete,
  }

  if (Row === WorkoutSessionSetRow) {
    rowProps.onUpdateSet = mockUpdate
  } else {
    rowProps.onUpdateDuration = mockUpdate
  }

  return React.createElement(Row, rowProps)
}

const rowCases = [
  ['strength', WorkoutSessionSetRow],
  ['cardio', CardioSessionSetRow],
]

function makeSet(id, completed) {
  return {
    id,
    reps: 8,
    weight: 50,
    durationSeconds: 300,
    completed,
  }
}

function colorChannels(color) {
  if (color.startsWith('#')) {
    return [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16))
  }
  return color
    .slice(color.indexOf('(') + 1, color.lastIndexOf(')'))
    .split(',')
    .slice(0, 3)
    .map(Number)
}

function relativeLuminance(color) {
  const [red, green, blue] = colorChannels(color).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  )
}

test.each(rowCases)(
  '%s row stays settled when mounted completed, recycled, or hydrated',
  async (_name, Row) => {
    let renderer
    await act(async () => {
      renderer = create(
        React.createElement(SetRowHarness, { row: Row, initialSet: makeSet('set-1', true) })
      )
    })
    expect(mockTimingCalls).toHaveLength(0)

    await act(async () => updateHarnessSet(makeSet('set-2', true)))
    expect(mockTimingCalls).toHaveLength(0)

    await act(async () => updateHarnessSet(makeSet('set-2', false)))
    expect(mockTimingCalls).toHaveLength(0)
    await act(async () => updateHarnessSet(makeSet('set-2', true)))
    expect(mockTimingCalls).toHaveLength(0)

    expect(renderer.root.findByType('Button').props.accessibilityState).toMatchObject({
      checked: true,
    })
    await act(async () => renderer.unmount())
  }
)

test.each(rowCases)('%s row animates after a user completes it', async (_name, Row) => {
  let renderer
  await act(async () => {
    renderer = create(
      React.createElement(SetRowHarness, { row: Row, initialSet: makeSet('set-1', false) })
    )
  })

  await act(async () => renderer.root.findByType('Button').props.onPress())

  expect(mockToggle).toHaveBeenCalledTimes(1)
  expect(renderer.root.findByType('Button').props.accessibilityState).toMatchObject({
    checked: true,
  })
  expect(mockTimingCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ toValue: 1, config: expect.objectContaining({ duration: 180 }) }),
      expect.objectContaining({
        toValue: 1.045,
        config: expect.objectContaining({ duration: 110 }),
      }),
      expect.objectContaining({ toValue: 1, config: expect.objectContaining({ duration: 130 }) }),
    ])
  )

  mockTimingCalls.length = 0
  await act(async () => renderer.root.findByType('Button').props.onPress())
  expect(renderer.root.findByType('Button').props.accessibilityState).toMatchObject({
    checked: false,
  })
  expect(mockTimingCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ toValue: 0, config: expect.objectContaining({ duration: 140 }) }),
      expect.objectContaining({ toValue: 0, config: expect.objectContaining({ duration: 110 }) }),
    ])
  )

  await act(async () => renderer.unmount())
})

test.each(rowCases)('%s row cancels motion when reduced motion turns on', async (_name, Row) => {
  let renderer
  await act(async () => {
    renderer = create(
      React.createElement(SetRowHarness, { row: Row, initialSet: makeSet('set-1', false) })
    )
  })

  await act(async () => renderer.root.findByType('Button').props.onPress())
  expect(mockTimingCalls.length).toBeGreaterThan(0)
  expect(renderer.root.findByType('Button').props.accessibilityState).toMatchObject({
    checked: true,
  })

  mockSharedValues[0].value = 0.44
  mockSharedValues[1].value = 0.31
  mockSharedValues[2].value = 1.03
  await act(async () => {
    mockReduceMotionEnabled = true
    mockPreferenceListeners.forEach((listener) => listener(true))
  })

  expect(cancelAnimation).toHaveBeenCalledTimes(3)
  expect(cancelAnimation).toHaveBeenNthCalledWith(1, mockSharedValues[0])
  expect(cancelAnimation).toHaveBeenNthCalledWith(2, mockSharedValues[1])
  expect(cancelAnimation).toHaveBeenNthCalledWith(3, mockSharedValues[2])
  expect(mockSharedValues.map((sharedValue) => sharedValue.value)).toEqual([1, 1, 1])

  mockTimingCalls.length = 0
  await act(async () => renderer.root.findByType('Button').props.onPress())
  expect(renderer.root.findByType('Button').props.accessibilityState).toMatchObject({
    checked: false,
  })
  await act(async () => renderer.root.findByType('Button').props.onPress())
  expect(renderer.root.findByType('Button').props.accessibilityState).toMatchObject({
    checked: true,
  })
  expect(mockTimingCalls).toHaveLength(0)
  expect(mockSharedValues.map((sharedValue) => sharedValue.value)).toEqual([1, 1, 1])

  await act(async () => renderer.unmount())
})

test.each([
  ['light', mockThemes.light],
  ['dark', mockThemes.dark],
])(
  '%s theme keeps the set/interval number readable throughout completion blending',
  async (_, theme) => {
    mockTheme = theme

    for (const [, Row] of rowCases) {
      mockSharedValues.length = 0
      let renderer
      await act(async () => {
        renderer = create(
          React.createElement(SetRowHarness, { row: Row, initialSet: makeSet('set-1', false) })
        )
      })

      for (let step = 0; step <= 100; step += 1) {
        const progress = step / 100
        mockSharedValues[0].value = progress
        await act(async () => {
          updateHarnessSet((current) => ({
            ...current,
            weight: current.weight + 1,
            durationSeconds: current.durationSeconds + 1,
          }))
        })

        const rowBackground =
          renderer.root.findAllByType('AnimatedView')[0].props.style.backgroundColor
        const numberColor = renderer.root.findByType('AnimatedText').props.style.color
        if (progress === 0) expect(numberColor).toBe(theme.muted)
        if (progress === 1) expect(numberColor).toBe(theme.onAccent)
        expect(contrastRatio(rowBackground, numberColor)).toBeGreaterThanOrEqual(4.5)
      }

      await act(async () => renderer.unmount())
    }
  }
)
