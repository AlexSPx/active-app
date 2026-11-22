jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'stable-id') }))
jest.mock('../../features/selfHosted/firstWorkout', () => ({
  prepareFirstWorkout: jest.fn(),
  seedAttachedProfile: jest.fn(),
}))
jest.mock('../../lib/db/connection', () => ({ getDatabase: jest.fn() }))
jest.mock('../../features/selfHosted/account', () => ({
  connectAccount: jest.fn(),
  disconnectAccount: jest.fn(),
  cancelAccountOperation: jest.fn(),
}))
let mockOwner = 'selfhosted:server-a:a'
jest.mock('../../stores/authStore', () => ({
  selectSelfHostedProfile: jest.fn(),
  useAuthStore: { getState: () => ({ profileOwnerId: mockOwner }) },
}))
jest.mock('../../features/selfHosted/storage', () => ({
  loadConnection: jest.fn(),
  saveConnection: jest.fn(),
  clearConnection: jest.fn(),
}))
const { Platform } = require('react-native')
const SQLite = require('expo-sqlite')
const imports = require('../../features/selfHosted/firstWorkout')
const { getDatabase } = require('../../lib/db/connection')
const account = require('../../features/selfHosted/account')
const storage = require('../../features/selfHosted/storage')
const { selectSelfHostedProfile } = require('../../stores/authStore')
const lifecycle = require('../../features/selfHosted/lifecycle')
const { finishProfileDatabase } = require('../../lib/db/profileDatabaseTransition')
const a = { kind: 'native', instanceId: 'server-a', accountId: 'a', expiresAt: Date.now() + 100000 }
const b = { kind: 'native', instanceId: 'server-b', accountId: 'b', expiresAt: Date.now() + 100000 }
let saved
let databaseFailure
beforeEach(() => {
  jest.clearAllMocks()
  Platform.OS = 'ios'
  mockOwner = 'selfhosted:server-a:a'
  getDatabase.mockResolvedValue({ source: true })
  imports.prepareFirstWorkout.mockImplementation(async (_db, _scope, snapshot) => snapshot)
  SQLite.openDatabaseAsync.mockResolvedValue({ closeAsync: jest.fn() })
  databaseFailure = null
  saved = a
  storage.loadConnection.mockImplementation(async () => saved)
  storage.saveConnection.mockImplementation(async (value) => {
    saved = value
  })
  storage.clearConnection.mockImplementation(async () => {
    saved = null
  })
  selectSelfHostedProfile.mockImplementation(async (connection) => {
    mockOwner = connection
      ? `selfhosted:${connection.instanceId}:${connection.accountId}`
      : 'local:device'
    const error = databaseFailure
    databaseFailure = null
    finishProfileDatabase(mockOwner, error)
  })
  account.connectAccount.mockImplementation(async (_, onConnection) => {
    saved = b
    await onConnection(b)
    return b
  })
  account.disconnectAccount.mockImplementation(async (beforeClear) => {
    await beforeClear()
    saved = null
  })
})

test('switches server and account after selecting the fenced profile', async () => {
  await lifecycle.signInToServer('https://server-b')
  expect(selectSelfHostedProfile).toHaveBeenCalledWith(b)
  expect(lifecycle.useConnectionLifecycle.getState()).toMatchObject({
    connection: b,
    status: 'connected',
  })
})
test('failed profile hydration restores the old connection and scope', async () => {
  selectSelfHostedProfile.mockRejectedValueOnce(new Error('hydrate failed'))
  await expect(lifecycle.signInToServer('https://server-b')).rejects.toThrow('hydrate failed')
  expect(saved).toBe(a)
  expect(mockOwner).toBe('selfhosted:server-a:a')
  expect(lifecycle.useConnectionLifecycle.getState()).toMatchObject({
    connection: a,
    status: 'connected',
  })
})
test('disconnect keeps credentials when profile selection fails', async () => {
  selectSelfHostedProfile.mockRejectedValueOnce(new Error('hydrate failed'))
  await expect(lifecycle.disconnectServer()).rejects.toThrow('hydrate failed')
  expect(saved).toBe(a)
  expect(storage.clearConnection).not.toHaveBeenCalled()
})
test.each(['database open', 'migration', 'local user restoration'])(
  'connect rolls back after %s fails',
  async (stage) => {
    databaseFailure = new Error(stage)
    await expect(lifecycle.signInToServer('https://server-b')).rejects.toThrow(stage)
    expect(saved).toBe(a)
    expect(selectSelfHostedProfile).toHaveBeenLastCalledWith(a)
    expect(lifecycle.useConnectionLifecycle.getState()).toMatchObject({
      connection: a,
      status: 'connected',
    })
  }
)
test.each(['database open', 'migration', 'local user restoration'])(
  'disconnect rolls back after %s fails',
  async (stage) => {
    databaseFailure = new Error(stage)
    await expect(lifecycle.disconnectServer()).rejects.toThrow(stage)
    expect(saved).toBe(a)
    expect(mockOwner).toBe('selfhosted:server-a:a')
    expect(selectSelfHostedProfile).toHaveBeenLastCalledWith(a)
  }
)
test('disconnect restores profile and credentials after storage failure', async () => {
  account.disconnectAccount.mockImplementation(async (beforeClear, onFailure) => {
    await beforeClear()
    saved = null
    await onFailure()
    throw new Error('storage failed')
  })
  await expect(lifecycle.disconnectServer()).rejects.toThrow('storage failed')
  expect(saved).toBe(a)
  expect(selectSelfHostedProfile).toHaveBeenLastCalledWith(a)
})
test('cancel during profile hydration restores the prior scope before a newer transition', async () => {
  let finish, started
  const pending = new Promise((resolve) => {
    started = resolve
  })
  selectSelfHostedProfile.mockImplementationOnce(() => {
    started()
    return new Promise((resolve) => {
      finish = () => {
        mockOwner = 'selfhosted:server-b:b'
        finishProfileDatabase(mockOwner, null)
        resolve()
      }
    })
  })
  const first = lifecycle.signInToServer('https://server-b')
  await pending
  lifecycle.cancelConnection()
  const second = lifecycle.disconnectServer()
  finish()
  await expect(first).rejects.toThrow('canceled')
  await second
  expect(saved).toBeNull()
  expect(selectSelfHostedProfile.mock.calls.map(([value]) => value)).toEqual([b, a, null])
  expect(lifecycle.useConnectionLifecycle.getState().status).toBe('local-only')
})
test('offline startup restores expired identity as auth-paused', async () => {
  saved = { ...a, expiresAt: 0 }
  await lifecycle.restoreConnectionLifecycle()
  expect(lifecycle.useConnectionLifecycle.getState()).toMatchObject({
    connection: saved,
    status: 'auth-paused',
  })
})

test('startup does not publish credentials for a different selected profile', async () => {
  saved = b
  await lifecycle.restoreConnectionLifecycle()
  expect(lifecycle.useConnectionLifecycle.getState()).toMatchObject({
    connection: null,
    status: 'auth-paused',
  })
})

test.each(['cancel', 'timeout'])(
  '%s releases stalled database readiness and fences late completion',
  async (reason) => {
    jest.useFakeTimers()
    let started
    const pending = new Promise((resolve) => {
      started = resolve
    })
    selectSelfHostedProfile.mockImplementationOnce(async () => {
      mockOwner = 'selfhosted:server-b:b'
      started()
    })
    const first = lifecycle.signInToServer('https://server-b')
    await pending
    await Promise.resolve()
    const failure = expect(first).rejects.toThrow(reason === 'cancel' ? 'canceled' : 'Timed out')
    if (reason === 'cancel') lifecycle.cancelConnection()
    else await jest.advanceTimersByTimeAsync(15000)
    await failure
    expect(saved).toBe(a)
    expect(mockOwner).toBe('selfhosted:server-a:a')
    expect(finishProfileDatabase('selfhosted:server-b:b', null)).toBe(false)
    await lifecycle.disconnectServer()
    expect(saved).toBeNull()
    jest.useRealTimers()
  }
)

test('persists the selected source and seeds the target before changing profile', async () => {
  mockOwner = 'local:device'
  saved = null
  const snapshot = { workoutId: 'local-workout' }
  await lifecycle.signInToServer('https://server-b', snapshot)
  expect(imports.prepareFirstWorkout).toHaveBeenCalledWith(
    { source: true },
    b,
    snapshot,
    'stable-id',
    'stable-id'
  )
  expect(imports.prepareFirstWorkout.mock.invocationCallOrder[0]).toBeLessThan(
    selectSelfHostedProfile.mock.invocationCallOrder[0]
  )
  expect(imports.seedAttachedProfile.mock.invocationCallOrder[0]).toBeLessThan(
    selectSelfHostedProfile.mock.invocationCallOrder[0]
  )
})

test('failed snapshot persistence restores local selection', async () => {
  mockOwner = 'local:device'
  saved = null
  imports.prepareFirstWorkout.mockRejectedValueOnce(new Error('disk full'))
  await expect(
    lifecycle.signInToServer('https://server-b', { workoutId: 'local' })
  ).rejects.toThrow('disk full')
  expect(mockOwner).toBe('local:device')
  expect(imports.seedAttachedProfile).not.toHaveBeenCalled()
})
