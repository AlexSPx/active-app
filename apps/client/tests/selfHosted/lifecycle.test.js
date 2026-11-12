jest.mock('../../features/selfHosted/account', () => ({
  connectAccount: jest.fn(),
  disconnectAccount: jest.fn(),
  cancelAccountOperation: jest.fn(),
}))
jest.mock('../../stores/authStore', () => ({
  selectSelfHostedProfile: jest.fn(),
  useAuthStore: { getState: () => ({ profileOwnerId: 'local' }) },
}))
jest.mock('../../features/selfHosted/storage', () => ({
  loadConnection: jest.fn(),
  saveConnection: jest.fn(),
  clearConnection: jest.fn(),
}))
const { Platform } = require('react-native')
const account = require('../../features/selfHosted/account')
const storage = require('../../features/selfHosted/storage')
const { selectSelfHostedProfile } = require('../../stores/authStore')
const lifecycle = require('../../features/selfHosted/lifecycle')
const a = { kind: 'native', instanceId: 'server-a', accountId: 'a', expiresAt: Date.now() + 100000 }
const b = { kind: 'native', instanceId: 'server-b', accountId: 'b', expiresAt: Date.now() + 100000 }
let saved
beforeEach(() => {
  jest.clearAllMocks()
  Platform.OS = 'ios'
  saved = a
  storage.loadConnection.mockImplementation(async () => saved)
  storage.saveConnection.mockImplementation(async (value) => {
    saved = value
  })
  storage.clearConnection.mockImplementation(async () => {
    saved = null
  })
  selectSelfHostedProfile.mockResolvedValue()
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
  expect(selectSelfHostedProfile).toHaveBeenLastCalledWith(a)
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
      finish = resolve
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
