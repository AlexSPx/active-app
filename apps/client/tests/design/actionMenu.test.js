jest.mock(
  '../../components/ui/CadenceOverlay',
  () => ({
    CadenceOverlay: (props) =>
      require('react').createElement('Overlay', props, props.open ? props.children : null),
  }),
  { virtual: true }
)
jest.mock('../../components/ui/icons', () => ({ MoreHorizontal: () => null }))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { ActionMenu } = require('../../components/ui/ActionMenu')

let tree
const onDelete = jest.fn()
const onOpen = jest.fn()

beforeEach(() => jest.clearAllMocks())
afterEach(() => {
  act(() => tree?.unmount())
  tree = undefined
})

function mount(props = {}) {
  act(() => {
    tree = create(
      React.createElement(ActionMenu, {
        label: 'Session actions',
        actions: [{ label: 'Delete record', onPress: onDelete, destructive: true }],
        onOpen,
        ...props,
      })
    )
  })
}

function button(label) {
  return tree.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onClick === 'function'
  )[0]
}

// Native Pressability routes accessibility activation through onClick and enforces disabled.
function activate(label) {
  act(() => button(label).props.onClick({ nativeEvent: {}, currentTarget: 1, target: 1 }))
}

function overlay() {
  return tree.root.findByType('Overlay')
}

function finishClosing() {
  act(() => overlay().props.onClosed())
}

test('labels the trigger and actions, tracks expanded state, and defers the action until closed once', () => {
  mount()
  expect(button('Session actions').props.accessibilityRole).toBe('button')
  expect(button('Session actions').props.accessibilityState).toMatchObject({
    expanded: false,
    disabled: false,
  })
  activate('Session actions')
  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(overlay().props.title).toBe('Session actions')
  expect(overlay().props.open).toBe(true)
  expect(button('Session actions').props.accessibilityState.expanded).toBe(true)
  expect(button('Delete record').props.accessibilityRole).toBe('button')
  activate('Delete record')
  expect(onDelete).not.toHaveBeenCalled()
  expect(overlay().props.open).toBe(false)
  expect(button('Session actions').props.accessibilityState.expanded).toBe(false)
  finishClosing()
  expect(onDelete).toHaveBeenCalledTimes(1)
  finishClosing()
  expect(onDelete).toHaveBeenCalledTimes(1)
})

test('cancelling the menu performs no action', () => {
  mount()
  activate('Session actions')
  act(() => overlay().props.onOpenChange(false))
  finishClosing()
  expect(onDelete).not.toHaveBeenCalled()
  expect(overlay().props.open).toBe(false)
})

test('disabled actions cannot activate through native accessibility input', () => {
  mount({ actions: [{ label: 'Delete record', onPress: onDelete, disabled: true }] })
  activate('Session actions')
  expect(button('Delete record').props.accessibilityState.disabled).toBe(true)
  expect(button('Delete record').props.onStartShouldSetResponder()).toBe(false)
  activate('Delete record')
  expect(overlay().props.open).toBe(true)
  act(() => overlay().props.onOpenChange(false))
  finishClosing()
  expect(onDelete).not.toHaveBeenCalled()
})

test('disabled trigger cannot open the menu', () => {
  mount({ disabled: true })
  expect(button('Session actions').props.accessibilityState.disabled).toBe(true)
  activate('Session actions')
  expect(onOpen).not.toHaveBeenCalled()
  expect(overlay().props.open).toBe(false)
  expect(button('Delete record')).toBeUndefined()
})

test('reopening and selecting Delete again runs exactly one callback per closed menu', () => {
  mount()
  for (let attempt = 1; attempt <= 2; attempt++) {
    activate('Session actions')
    activate('Delete record')
    expect(onDelete).toHaveBeenCalledTimes(attempt - 1)
    finishClosing()
    expect(onDelete).toHaveBeenCalledTimes(attempt)
  }
  activate('Session actions')
  act(() => overlay().props.onOpenChange(false))
  finishClosing()
  expect(onDelete).toHaveBeenCalledTimes(2)
  expect(onOpen).toHaveBeenCalledTimes(3)
})
