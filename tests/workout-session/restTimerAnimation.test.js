const mockTimingCalls = []
const mockSharedValues = []
let mockReduceMotion = false
let mockReducedMotionListener

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: { View: 'AnimatedView' },
    cancelAnimation: jest.fn(),
    Easing: {
      cubic: (value) => value,
      linear: (value) => value,
      out: (easing) => easing,
    },
    useAnimatedStyle: (createStyle) => createStyle(),
    useReducedMotion: () => mockReduceMotion,
    useSharedValue: (initialValue) => {
      const sharedValue = React.useRef(null)
      if (sharedValue.current === null) {
        sharedValue.current = { value: initialValue }
        mockSharedValues.push(sharedValue.current)
      }
      return sharedValue.current
    },
    withTiming: (toValue, config) => {
      mockTimingCalls.push({ toValue, config })
      return toValue
    },
  }
})

jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    Button: ({ children, ...props }) => React.createElement('Button', props, children),
    UiText: ({ children, ...props }) => React.createElement('UiText', props, children),
  }
})

const React = require('react')
const { act, create } = require('react-test-renderer')
const { AccessibilityInfo } = require('react-native')
const { cancelAnimation } = require('react-native-reanimated')
const { RestTimerOverlay } = require('../../features/workout-session/components/RestTimerOverlay')

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockTimingCalls.length = 0
  mockSharedValues.length = 0
  mockReduceMotion = false
  mockReducedMotionListener = undefined
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((eventName, listener) => {
    if (eventName === 'reduceMotionChanged') mockReducedMotionListener = listener
    return { remove: jest.fn() }
  })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

function makeProps(overrides = {}) {
  return {
    active: true,
    remaining: 90,
    total: 120,
    onExtend: jest.fn(),
    onSkip: jest.fn(),
    nextStepText: 'Next up: Squat, set 2.',
    bottomOffset: 96,
    ...overrides,
  }
}

test('enters, smooths countdown progress and disables interaction while exiting', async () => {
  let renderer
  const props = makeProps()

  await act(async () => {
    renderer = create(React.createElement(RestTimerOverlay, props))
  })

  const overlay = renderer.root.findByType('AnimatedView')
  expect(overlay.props.pointerEvents).toBe('box-none')
  expect(overlay.props.style[0]).toEqual({ bottom: 96 })
  expect(mockTimingCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ toValue: 1, config: expect.objectContaining({ duration: 280 }) }),
      expect.objectContaining({ toValue: 0, config: expect.objectContaining({ duration: 280 }) }),
    ])
  )

  const timerText = renderer.root
    .findAllByType('UiText')
    .find((node) => node.props.textRole === 'screenTitle')
  expect(timerText.children.join('')).toBe('1:30')
  expect(timerText.props.style).toEqual({ fontVariant: ['tabular-nums'] })
  expect(
    renderer.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue
  ).toEqual({
    min: 0,
    max: 100,
    now: 25,
  })

  await act(async () => {
    renderer.update(React.createElement(RestTimerOverlay, makeProps({ remaining: 89 })))
  })
  expect(
    renderer.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now
  ).toBe(26)
  const progressTiming = mockTimingCalls.find((call) => call.config.duration === 1000)
  expect(progressTiming.toValue).toBeCloseTo(31 / 120)

  await act(async () => {
    renderer.update(
      React.createElement(RestTimerOverlay, makeProps({ active: false, remaining: 89 }))
    )
  })
  expect(renderer.root.findByType('AnimatedView').props.pointerEvents).toBe('none')
  expect(mockTimingCalls).toContainEqual({
    toValue: 0,
    config: expect.objectContaining({ duration: 180 }),
  })

  await act(async () => jest.advanceTimersByTime(179))
  expect(renderer.root.findByType('AnimatedView')).toBeDefined()
  await act(async () => jest.advanceTimersByTime(1))
  expect(() => renderer.root.findByType('AnimatedView')).toThrow()
  await act(async () => renderer.unmount())
})

test('reduced motion removes spatial entrance and countdown smoothing', async () => {
  mockReduceMotion = true
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true)
  let renderer

  await act(async () => {
    renderer = create(React.createElement(RestTimerOverlay, makeProps({ remaining: 60 })))
  })

  expect(renderer.root.findByType('AnimatedView').props.style[1].transform).toEqual([
    { translateY: 0 },
  ])
  expect(mockTimingCalls).toEqual([
    { toValue: 1, config: expect.objectContaining({ duration: 120 }) },
  ])

  await act(async () => {
    renderer.update(React.createElement(RestTimerOverlay, makeProps({ remaining: 59 })))
  })
  expect(mockTimingCalls).toHaveLength(1)
  await act(async () => renderer.unmount())
})

test('live reduced motion changes cancel progress smoothing and disable future smoothing', async () => {
  let renderer

  await act(async () => {
    renderer = create(React.createElement(RestTimerOverlay, makeProps()))
  })
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    renderer.update(React.createElement(RestTimerOverlay, makeProps({ remaining: 89 })))
  })

  const progressSharedValue = mockSharedValues[2]
  progressSharedValue.value = 0.2
  expect(mockReducedMotionListener).toBeDefined()

  await act(async () => {
    mockReducedMotionListener(true)
  })

  expect(cancelAnimation).toHaveBeenCalledWith(progressSharedValue)
  expect(progressSharedValue.value).toBeCloseTo(31 / 120)
  expect(renderer.root.findByType('AnimatedView').props.style[1].transform).toEqual([
    { translateY: 0 },
  ])

  const timingCallCount = mockTimingCalls.length
  await act(async () => {
    renderer.update(React.createElement(RestTimerOverlay, makeProps({ remaining: 88 })))
  })
  expect(progressSharedValue.value).toBeCloseTo(32 / 120)
  expect(
    mockTimingCalls
      .slice(timingCallCount)
      .filter((call) => [1000, 320].includes(call.config.duration))
  ).toEqual([])

  await act(async () => renderer.unmount())
})

test('inactive overlay activation starts at zero for a same-total timer', async () => {
  let renderer

  await act(async () => {
    renderer = create(
      React.createElement(RestTimerOverlay, makeProps({ active: false, remaining: 0 }))
    )
  })
  expect(renderer.toJSON()).toBeNull()

  await act(async () => {
    renderer.update(React.createElement(RestTimerOverlay, makeProps({ remaining: 120 })))
  })

  const progressFill = renderer.root.findAllByType('AnimatedView')[1]
  expect(progressFill.props.style.width).toBe('0%')
  expect(mockTimingCalls.some((call) => call.config.duration === 320)).toBe(false)
  await act(async () => renderer.unmount())
})

test('deactivation resets progress before a same-total restart', async () => {
  let renderer

  await act(async () => {
    renderer = create(
      React.createElement(RestTimerOverlay, makeProps({ remaining: 0, total: 120 }))
    )
  })
  expect(renderer.root.findAllByType('AnimatedView')[1].props.style.width).toBe('100%')

  await act(async () => {
    renderer.update(
      React.createElement(RestTimerOverlay, makeProps({ active: false, remaining: 0, total: 120 }))
    )
  })
  expect(renderer.root.findByType('AnimatedView').props.pointerEvents).toBe('none')

  await act(async () => {
    renderer.update(
      React.createElement(RestTimerOverlay, makeProps({ active: false, remaining: 0, total: 120 }))
    )
  })
  expect(renderer.root.findAllByType('AnimatedView')[1].props.style.width).toBe('0%')

  await act(async () => {
    renderer.update(
      React.createElement(RestTimerOverlay, makeProps({ remaining: 120, total: 120 }))
    )
  })
  expect(renderer.root.findAllByType('AnimatedView')[1].props.style.width).toBe('0%')
  expect(mockTimingCalls.some((call) => call.config.duration === 320)).toBe(false)
  await act(async () => renderer.unmount())
})
