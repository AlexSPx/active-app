const React = require('react')
const { act, create } = require('react-test-renderer')

let mockCurrentScope
let mockAuthState
let mockSyncListeners

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}))
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    Stack: { Screen: (props) => React.createElement('StackScreen', props) },
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
  }
})
jest.mock('tamagui', () => {
  const React = require('react')
  return Object.fromEntries(
    ['Button', 'Paragraph', 'Text', 'XStack', 'YStack'].map((name) => [
      name,
      (props) => React.createElement(name, props, props.children),
    ])
  )
})
jest.mock('../../components/settings/SettingsPage', () => ({
  SettingsPage: (props) => require('react').createElement('Page', {}, props.children, props.footer),
}))
jest.mock('../../components/WorkOSSignInButton', () => ({
  WorkOSSignInButton: (props) => require('react').createElement('SignInButton', props),
}))
jest.mock('../../lib/profileScope', () => ({
  getProfileScope: jest.fn(() => ({ ...mockCurrentScope })),
  isCurrentProfile: jest.fn(
    (scope) =>
      scope.ownerId === mockCurrentScope.ownerId && scope.generation === mockCurrentScope.generation
  ),
}))
jest.mock('../../lib/sync', () => ({
  syncEngine: {
    listJobs: jest.fn(),
    retryJob: jest.fn(),
    discardJob: jest.fn(),
    on: jest.fn((event, listener) => {
      mockSyncListeners.add(listener)
      return () => mockSyncListeners.delete(listener)
    }),
    authPaused: false,
  },
}))
jest.mock('../../stores/authStore', () => ({
  useAuthStore: jest.fn((selector) => selector(mockAuthState)),
}))

const { Alert } = require('react-native')
const { syncEngine } = require('../../lib/sync')
const { useAuthStore } = require('../../stores/authStore')
const SettingsScreen = require('../../app/(tabs)/settings/sync').default

function job(overrides = {}) {
  return {
    id: 'private-queue-id',
    endpoint: 'createWorkout',
    status: 'dead_letter',
    error_message: '409: duplicate name',
    blocked_reason: undefined,
    request_payload: null,
    ...overrides,
  }
}

async function renderScreen() {
  let view
  await act(async () => {
    view = create(React.createElement(SettingsScreen))
  })
  return view
}

beforeEach(() => {
  mockCurrentScope = { ownerId: 'account:user-a', generation: 1 }
  mockAuthState = {
    profileOwnerId: 'account:user-a',
    isProfileTransitioning: false,
    serverSession: 'valid',
    isAuthenticated: true,
  }
  mockSyncListeners = new Set()
  syncEngine.authPaused = false
  syncEngine.listJobs.mockResolvedValue([job()])
  syncEngine.retryJob.mockClear()
  syncEngine.retryJob.mockResolvedValue(undefined)
  syncEngine.discardJob.mockClear()
  syncEngine.discardJob.mockResolvedValue(undefined)
  Alert.alert.mockClear()
  useAuthStore.mockImplementation((selector) => selector(mockAuthState))
})

test('queued errors use readable item labels and retry the stored job', async () => {
  const unsafeJob = job({
    id: 'private-api-queue-id',
    endpoint: 'deleteWorkout',
    error_message: 'API error: 503 https://api.example.test/workouts local_secret',
    local_id: 'local_secret',
  })
  syncEngine.listJobs.mockResolvedValue([job(), unsafeJob])
  const view = await renderScreen()
  const text = view.root.findAllByType('Text').map((item) => item.props.children)
  const messages = view.root.findAllByType('Paragraph').map((item) => item.props.children)
  const retry = view.root
    .findAllByType('Button')
    .find((button) => button.props.children === 'Retry')

  expect(text).toContain('Create workout')
  expect(text).toContain('Needs attention')
  expect(messages).toContain('duplicate name You can retry or discard it.')
  expect(messages).toContain('The server rejected this change. You can retry or discard it.')
  expect(messages).not.toContain('409: duplicate name')
  expect(text).not.toContain('private-queue-id')
  expect(text).not.toContain('private-api-queue-id')
  expect(text).not.toContain('createWorkout')
  expect(text).not.toContain('409: duplicate name')
  expect(messages.join(' ')).not.toMatch(/https:\/\/|local_secret|API error: 503/)

  await act(async () => retry.props.onPress())
  expect(syncEngine.retryJob).toHaveBeenCalledWith('private-queue-id')
  await act(async () => view.unmount())
})

test('discard asks for confirmation and keeps the change until confirmed', async () => {
  const otherJob = job({ id: 'another-queue-id', endpoint: 'createRoutine' })
  syncEngine.listJobs.mockResolvedValueOnce([job(), otherJob]).mockResolvedValueOnce([otherJob])
  const view = await renderScreen()
  const discard = view.root
    .findAllByType('Button')
    .find((button) => button.props.children === 'Discard')

  await act(async () => discard.props.onPress())
  expect(Alert.alert).toHaveBeenCalledWith(
    'Discard this queued change?',
    expect.stringContaining('related queued changes stay on this device.'),
    expect.any(Array)
  )
  expect(syncEngine.discardJob).not.toHaveBeenCalled()

  const confirm = Alert.alert.mock.calls[0][2].find((action) => action.text === 'Discard change')
  await act(async () => confirm.onPress())
  expect(syncEngine.discardJob).toHaveBeenCalledWith('private-queue-id')
  expect(view.root.findAllByType('Text').map((item) => item.props.children)).toContain(
    'Create routine'
  )
  expect(view.root.findAllByType('Text').map((item) => item.props.children)).not.toContain(
    'Create workout'
  )
  await act(async () => view.unmount())
})

test('discard warns when a lost reply may hide a completed server change', async () => {
  syncEngine.listJobs.mockResolvedValue([job({ request_payload: '[{"title":"Sent"}]' })])
  const view = await renderScreen()
  const discard = view.root
    .findAllByType('Button')
    .find((button) => button.props.children === 'Discard')

  await act(async () => discard.props.onPress())
  expect(Alert.alert.mock.calls[0][1]).toContain('server may already have applied this change')
  await act(async () => view.unmount())
})

test('auth pause offers sign-in and disables retry without clearing queued changes', async () => {
  syncEngine.authPaused = true
  syncEngine.listJobs.mockResolvedValue([job({ status: 'auth_required' })])
  const view = await renderScreen()

  expect(view.root.findByType('SignInButton').props.label).toBe('Sign in again')
  expect(view.root.findAllByType('Button').map((button) => button.props.children)).not.toContain(
    'Retry'
  )
  expect(view.root.findAllByType('Paragraph').map((item) => item.props.children)).toContain(
    'Sign in again to resume syncing.'
  )
  expect(syncEngine.retryJob).not.toHaveBeenCalled()
  await act(async () => view.unmount())
})

test('an older queue snapshot cannot replace a newer refresh for the same account', async () => {
  let resolveOlderLoad
  let resolveNewerLoad
  syncEngine.listJobs
    .mockResolvedValueOnce([job()])
    .mockReturnValueOnce(new Promise((resolve) => (resolveOlderLoad = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (resolveNewerLoad = resolve)))
  const view = await renderScreen()
  const syncChange = mockSyncListeners.values().next().value

  await act(async () => syncChange())
  await act(async () => syncChange())
  await act(async () => resolveNewerLoad([]))
  await act(async () => resolveOlderLoad([job({ endpoint: 'createRoutine' })]))

  expect(view.root.findAllByType('Text').map((item) => item.props.children)).not.toContain(
    'Create routine'
  )
  expect(view.root.findAllByType('Paragraph').map((item) => item.props.children)).toContain(
    'You’re all caught up.'
  )
  await act(async () => view.unmount())
})

test('late queue results and captured actions are fenced after the account changes', async () => {
  let resolveStaleLoad
  syncEngine.listJobs
    .mockResolvedValueOnce([job()])
    .mockReturnValueOnce(new Promise((resolve) => (resolveStaleLoad = resolve)))
    .mockResolvedValueOnce([])
  let view
  await act(async () => {
    view = create(React.createElement(SettingsScreen))
  })
  const staleRetry = view.root
    .findAllByType('Button')
    .find((button) => button.props.children === 'Retry')
  const staleRetryAction = staleRetry.props.onPress
  const syncChange = mockSyncListeners.values().next().value
  await act(async () => syncChange())

  mockCurrentScope = { ownerId: 'account:user-b', generation: 2 }
  mockAuthState = { ...mockAuthState, profileOwnerId: 'account:user-b' }
  await act(async () => view.update(React.createElement(SettingsScreen)))
  await act(async () => resolveStaleLoad([job({ endpoint: 'createRoutine' })]))

  await act(async () => staleRetryAction())
  expect(syncEngine.retryJob).not.toHaveBeenCalled()
  expect(view.root.findAllByType('Text').map((item) => item.props.children)).not.toContain(
    'Create routine'
  )
  await act(async () => view.unmount())
})
