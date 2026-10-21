jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const {
  AccessibilityInfo,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  View,
} = require('react-native')
const { CadenceOverlay } = require('../../components/ui/CadenceOverlay')

let tree
let restoreRequestAnimationFrame

afterEach(() => {
  act(() => tree?.unmount())
  tree = undefined
  restoreRequestAnimationFrame?.()
  restoreRequestAnimationFrame = undefined
  jest.restoreAllMocks()
})

function modal() {
  return tree.root.findByType(Modal)
}

function sheet() {
  return tree.root.findAll(
    (node) => node.props.className === 'rounded-t-3xl border-t border-divider bg-surface'
  )[0]
}

test('uses available keyboard-adjusted height for snap points and preserves back dismissal', () => {
  const onOpenChange = jest.fn()

  act(() => {
    tree = create(
      <CadenceOverlay
        open
        onOpenChange={onOpenChange}
        title="Choose a routine"
        snapPoints={[90, 50]}
        position={0}
      >
        <View />
      </CadenceOverlay>
    )
  })

  const availableSpace = tree.root.findAll(
    (node) =>
      node.props.className === 'flex-1 justify-end' &&
      Array.isArray(node.props.children) &&
      node.props.children.length === 2
  )[0]
  act(() => availableSpace.props.onLayout({ nativeEvent: { layout: { width: 360, height: 400 } } }))
  expect(sheet().props.style.height).toBe(360)
  expect(tree.root.findByProps({ accessibilityRole: 'header' }).props.children).toBe(
    'Choose a routine'
  )
  expect(modal().props.visible).toBe(true)

  act(() => {
    tree.update(
      <CadenceOverlay
        open
        onOpenChange={onOpenChange}
        title="Choose a routine"
        snapPoints={[90, 50]}
        position={1}
      >
        <View />
      </CadenceOverlay>
    )
  })
  expect(sheet().props.style.height).toBe(200)

  act(() => modal().props.onRequestClose())
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('fit-content overlays keep their measured height with a safe-area-aware maximum', () => {
  act(() => {
    tree = create(
      <CadenceOverlay open onOpenChange={() => {}} title="Confirm change">
        <View />
      </CadenceOverlay>
    )
  })

  const availableSpace = tree.root.findAll(
    (node) =>
      node.props.className === 'flex-1 justify-end' &&
      Array.isArray(node.props.children) &&
      node.props.children.length === 2
  )[0]
  act(() => availableSpace.props.onLayout({ nativeEvent: { layout: { width: 360, height: 400 } } }))

  expect(sheet().props.style.height).toBeUndefined()
  expect(sheet().props.style.maxHeight).toBe(360)
})

test('dragging a controlled sheet changes detents, then dismisses from its lowest detent', () => {
  const onOpenChange = jest.fn()
  const onPositionChange = jest.fn()
  const nativePanHandlers = {
    onMoveShouldSetResponder: jest.fn(),
    onResponderRelease: jest.fn(),
  }
  let responderConfig
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    responderConfig = config
    return { panHandlers: nativePanHandlers }
  })
  jest.spyOn(Animated, 'spring').mockReturnValue({ start: jest.fn() })

  const renderOverlay = (position) => (
    <CadenceOverlay
      open
      onOpenChange={onOpenChange}
      onPositionChange={onPositionChange}
      snapPoints={[85, 50, 25]}
      position={position}
      title="Workout details"
    >
      <View />
    </CadenceOverlay>
  )

  act(() => {
    tree = create(renderOverlay(0))
  })

  const gestureSurface = tree.root
    .findAllByType(View)
    .find(
      (node) =>
        node.props.onMoveShouldSetResponder === nativePanHandlers.onMoveShouldSetResponder &&
        node.props.onResponderRelease === nativePanHandlers.onResponderRelease
    )
  const handle = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Dismiss Workout details' &&
      node.props.className === 'h-touch items-center justify-center'
  )[0]
  expect(gestureSurface).toBeDefined()
  expect(handle).toBeDefined()
  expect(handle.props.accessibilityRole).toBe('button')
  expect(handle.props.accessibilityLabel).toBe('Dismiss Workout details')
  expect(typeof handle.props.onPress).toBe('function')

  expect(responderConfig.onMoveShouldSetPanResponder({}, { dx: 0, dy: 12 })).toBe(true)
  act(() => responderConfig.onPanResponderRelease({}, { dx: 0, dy: 60, vy: 0 }))
  expect(onPositionChange).toHaveBeenLastCalledWith(1)
  expect(onOpenChange).not.toHaveBeenCalled()

  act(() => tree.update(renderOverlay(1)))
  act(() => responderConfig.onPanResponderRelease({}, { dx: 0, dy: -60, vy: 0 }))
  expect(onPositionChange).toHaveBeenLastCalledWith(0)
  expect(onOpenChange).not.toHaveBeenCalled()

  act(() => tree.update(renderOverlay(2)))
  act(() => responderConfig.onPanResponderRelease({}, { dx: 0, dy: 60, vy: 0 }))
  expect(onOpenChange).toHaveBeenCalledTimes(1)
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('a non-dismissible sheet ignores hardware back, backdrop press, and downward drag', () => {
  const onOpenChange = jest.fn()
  let responderConfig
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    responderConfig = config
    return { panHandlers: {} }
  })
  jest.spyOn(Animated, 'spring').mockReturnValue({ start: jest.fn() })

  act(() => {
    tree = create(
      <CadenceOverlay
        open
        onOpenChange={onOpenChange}
        dismissible={false}
        snapPoints={[85, 50]}
        position={1}
        title="Saving workout"
      >
        <View />
      </CadenceOverlay>
    )
  })

  act(() => modal().props.onRequestClose())
  const backdrop = tree.root.findAll((node) => node.props.className === 'flex-1 bg-black/50')[0]
  act(() => backdrop.props.onPress())
  act(() => responderConfig.onPanResponderRelease({}, { dx: 0, dy: 60, vy: 0 }))

  expect(onOpenChange).not.toHaveBeenCalled()
  expect(modal().props.visible).toBe(true)
})

function closingOverlay(platform) {
  jest.replaceProperty(Platform, 'OS', platform)
  const onClosed = jest.fn()
  const animationCompletions = []
  const scheduledFrames = []
  const originalRequestAnimationFrame = global.requestAnimationFrame
  global.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback)
    return scheduledFrames.length
  }
  restoreRequestAnimationFrame = () => {
    if (originalRequestAnimationFrame) {
      global.requestAnimationFrame = originalRequestAnimationFrame
    } else {
      delete global.requestAnimationFrame
    }
  }
  const restoreFocus = jest
    .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {})
  jest.spyOn(require('react-native'), 'findNodeHandle').mockReturnValue(42)
  jest.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (callback) => animationCompletions.push(callback),
  }))
  const returnFocusRef = { current: null }
  const renderOverlay = (open) => (
    <CadenceOverlay
      open={open}
      onOpenChange={() => {}}
      onClosed={onClosed}
      returnFocusRef={returnFocusRef}
      title="Actions"
    >
      <View />
    </CadenceOverlay>
  )
  act(() => {
    tree = create(renderOverlay(true))
  })
  act(() => animationCompletions[0]({ finished: true }))
  restoreFocus.mockClear()
  act(() => tree.update(renderOverlay(false)))
  return { onClosed, restoreFocus, animationCompletions, scheduledFrames, renderOverlay }
}

test.each(['ios', 'android'])(
  '%s completes closing once after its dismissal signal',
  (platform) => {
    const { onClosed, restoreFocus, animationCompletions, scheduledFrames } =
      closingOverlay(platform)
    expect(onClosed).not.toHaveBeenCalled()

    act(() => animationCompletions[1]({ finished: false }))
    expect(modal().props.visible).toBe(true)
    expect(onClosed).not.toHaveBeenCalled()
    act(() => animationCompletions[1]({ finished: true }))
    expect(modal().props.visible).toBe(false)
    if (platform === 'ios') act(() => scheduledFrames.forEach((callback) => callback()))
    expect(onClosed).not.toHaveBeenCalled()
    expect(restoreFocus).not.toHaveBeenCalled()

    const dismiss = platform === 'ios' ? modal().props.onDismiss : scheduledFrames[0]
    expect(scheduledFrames).toHaveLength(platform === 'ios' ? 0 : 1)
    act(() => dismiss())
    act(() => dismiss())
    expect(onClosed).toHaveBeenCalledTimes(1)
    expect(restoreFocus).toHaveBeenCalledTimes(1)
    expect(restoreFocus).toHaveBeenCalledWith(42)
  }
)

test.each(['ios', 'android'])('%s cancels an exit animation when reopened', (platform) => {
  const { onClosed, restoreFocus, animationCompletions, scheduledFrames, renderOverlay } =
    closingOverlay(platform)
  act(() => tree.update(renderOverlay(true)))
  act(() => animationCompletions[1]({ finished: true }))
  act(() => modal().props.onDismiss())
  expect(scheduledFrames).toHaveLength(0)
  expect(modal().props.visible).toBe(true)
  expect(onClosed).not.toHaveBeenCalled()
  expect(restoreFocus).not.toHaveBeenCalled()
})

test.each([
  ['ios', 'reopen'],
  ['ios', 'unmount'],
  ['android', 'reopen'],
  ['android', 'unmount'],
])('%s ignores a pending dismissal after %s', (platform, cancellation) => {
  const { onClosed, restoreFocus, animationCompletions, scheduledFrames, renderOverlay } =
    closingOverlay(platform)
  act(() => animationCompletions[1]({ finished: true }))
  const dismiss = platform === 'ios' ? modal().props.onDismiss : scheduledFrames[0]
  act(() => {
    if (cancellation === 'reopen') tree.update(renderOverlay(true))
    else tree.unmount()
  })
  act(() => dismiss())
  expect(onClosed).not.toHaveBeenCalled()
  expect(restoreFocus).not.toHaveBeenCalled()
})

test('Android sheets release keyboard padding on hide even when the event includes system bar space', async () => {
  const listeners = new Map()
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    const callbacks = listeners.get(event) ?? new Set()
    callbacks.add(listener)
    listeners.set(event, callbacks)
    return { remove: () => callbacks.delete(listener) }
  })
  const keyboardEvents = {
    emit: (event, payload) => listeners.get(event)?.forEach((listener) => listener(payload)),
  }
  jest.spyOn(Animated, 'parallel').mockReturnValue({ start: jest.fn() })
  jest.replaceProperty(Platform, 'OS', 'android')
  act(() => {
    tree = create(
      <CadenceOverlay open onOpenChange={() => {}} snapPoints={[90]} title="Add widget">
        <View />
      </CadenceOverlay>
    )
  })

  const avoidance = () => tree.root.findByType(KeyboardAvoidingView)
  const layout = { x: 0, y: 0, width: 400, height: 889 }
  await act(async () =>
    avoidance()
      .findAllByType(View)[0]
      .props.onLayout({
        persist() {},
        nativeEvent: { layout },
      })
  )

  await act(async () =>
    keyboardEvents.emit('keyboardDidShow', {
      duration: 0,
      endCoordinates: { screenX: 0, screenY: 553, width: 400, height: 336 },
    })
  )
  const padding = () =>
    StyleSheet.flatten(avoidance().findAllByType(View)[0].props.style).paddingBottom
  expect(padding()).toBe(336)

  await act(async () =>
    keyboardEvents.emit('keyboardDidHide', {
      duration: 0,
      endCoordinates: { screenX: 0, screenY: 817, width: 400, height: 0 },
    })
  )
  expect(padding()).toBe(0)
})
