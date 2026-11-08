jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'operation-key') }))
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }))
jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn(),
  ResponseType: { Code: 'code' },
  exchangeCodeAsync: jest.fn(),
  refreshAsync: jest.fn(),
}))
jest.mock('../../features/selfHosted/storage', () => ({
  loadConnection: jest.fn(),
  saveConnection: jest.fn(),
  clearConnection: jest.fn(),
  loadPlan: jest.fn(),
  savePlan: jest.fn(),
  clearPlan: jest.fn(),
}))
jest.mock('../../../../packages/api-client/src', () => ({
  createClient: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(status) {
      super()
      this.status = status
    }
  },
}))
const { Platform } = require('react-native')
const storage = require('../../features/selfHosted/storage')
const { createClient, ApiError } = require('../../../../packages/api-client/src')
const auth = require('expo-auth-session')
const account = require('../../features/selfHosted/account')
const profile = {
  id: 'account-a',
  email: 'a@example.com',
  username: 'user_123',
  firstName: 'User',
  lastName: 'User',
  createdAt: '2026-01-01T00:00:00Z',
  timezone: null,
  activeRoutineId: null,
  measurements: null,
  registrationCompleted: false,
  profileVersion: 1,
}
const metadata = {
  issuer: 'https://issuer.test',
  clientId: 'public-client',
  resource: 'api',
  authorizationEndpoint: 'https://issuer.test/authorize',
  tokenEndpoint: 'https://issuer.test/token',
  endSessionEndpoint: 'https://issuer.test/logout',
  redirectUri: 'activenext://auth/callback',
}
const connection = {
  ...metadata,
  kind: 'native',
  baseUrl: 'https://active.test',
  instanceId: 'instance-a',
  accountId: profile.id,
  subject: 'subject-a',
  accessToken: 'access',
  refreshToken: 'refresh',
  idToken: 'id',
  expiresAt: Date.now() + 3600000,
}
let plans
let calls
let failPreferences
let failDelete
beforeEach(() => {
  jest.clearAllMocks()
  Platform.OS = 'ios'
  plans = new Map()
  calls = []
  failPreferences = false
  failDelete = false
  storage.loadConnection.mockResolvedValue(connection)
  storage.loadPlan.mockImplementation(async (_, kind) => plans.get(kind) ?? null)
  storage.savePlan.mockImplementation(async (_, plan) =>
    plans.set(plan.kind, JSON.parse(JSON.stringify(plan)))
  )
  storage.clearPlan.mockImplementation(async (_, kind) => plans.delete(kind))
  createClient.mockImplementation(() => async (operation, args) => {
    calls.push([operation, args])
    if (operation === 'discovery') return { ...metadata, instanceId: connection.instanceId }
    if (operation === 'profile.get') return profile
    if (operation === 'preferences.get') throw new ApiError(404)
    if (operation === 'profile.update') return { ...profile, ...args.body, profileVersion: 2 }
    if (operation === 'preferences.put') {
      if (failPreferences) throw new Error('offline')
      return { ...args.body, version: 1 }
    }
    if (operation === 'profile.delete') {
      if (failDelete) throw new Error('response lost')
      return { deletedUserId: profile.id }
    }
    throw new Error(operation)
  })
})

test('persists profile and preference requests, then resumes without overwriting committed profile', async () => {
  const device = {
    firstName: 'Alex',
    lastName: 'Smith',
    timezone: 'Europe/Sofia',
    measurements: { weightKg: 75, heightCm: 180 },
    registrationCompleted: true,
  }
  const preferences = { enabled: true, schedule: ['09:00'], timezone: device.timezone }
  failPreferences = true
  await expect(account.initializeFromDevice(device, preferences)).rejects.toThrow('offline')
  expect(plans.get('initialize').plan.stage).toBe('preferences')
  expect(storage.savePlan.mock.invocationCallOrder[0]).toBeLessThan(
    storage.savePlan.mock.invocationCallOrder[1]
  )
  failPreferences = false
  await account.initializeFromDevice({ ...device, firstName: 'Changed locally' }, preferences)
  const writes = calls.filter(([operation]) => operation === 'profile.update')
  expect(writes).toHaveLength(1)
  expect(writes[0][1].body.firstName).toBe('Alex')
  const retries = calls.filter(([operation]) => operation === 'preferences.put')
  expect(retries[0]).toEqual(retries[1])
  expect(plans.size).toBe(0)
  expect(storage.clearConnection).not.toHaveBeenCalled()
})

test('deletion keeps credentials on uncertain outcome and retries without a profile GET', async () => {
  failDelete = true
  await expect(account.deleteRemoteAccount()).rejects.toThrow('response lost')
  expect(storage.clearConnection).not.toHaveBeenCalled()
  expect(plans.get('delete').plan.request.idempotencyKey).toBe('operation-key')
  calls.length = 0
  failDelete = false
  await account.deleteRemoteAccount()
  expect(calls.map(([operation]) => operation)).toEqual(['discovery', 'profile.delete'])
  expect(storage.clearConnection).toHaveBeenCalledTimes(1)
})

test('a changed server instance prevents sending credentials or mutation requests', async () => {
  createClient.mockImplementation(() => async () => ({ instanceId: 'different' }))
  await expect(account.deleteRemoteAccount()).rejects.toThrow('different server')
  expect(storage.savePlan).not.toHaveBeenCalled()
  expect(storage.clearConnection).not.toHaveBeenCalled()
})

test('canceling authentication preserves the existing connection and pending work', async () => {
  auth.AuthRequest.mockImplementation(() => ({ promptAsync: async () => ({ type: 'cancel' }) }))
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => metadata }))
  await expect(account.connectAccount(connection.baseUrl)).resolves.toBeNull()
  expect(storage.saveConnection).not.toHaveBeenCalled()
  expect(storage.clearConnection).not.toHaveBeenCalled()
})

test('refresh rejects a changed subject without replacing stored credentials', async () => {
  storage.loadConnection.mockResolvedValue({ ...connection, expiresAt: 0 })
  auth.refreshAsync.mockResolvedValue({
    accessToken: 'new',
    refreshToken: 'rotated',
    issuedAt: 1,
    expiresIn: 600,
  })
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ subject: 'other' }),
  }))
  await expect(account.readAccount()).rejects.toThrow('refreshed account changed')
  expect(storage.saveConnection).not.toHaveBeenCalled()
})

test.each([
  'http://example.com',
  'https://user:secret@example.com',
  'https://example.com/path',
  'https://example.com/?token=secret',
])('rejects unsafe server address %s', (value) => {
  expect(() => account.serverUrl(value)).toThrow()
})

test('web reauthentication cannot replace a different account with pending work', async () => {
  Platform.OS = 'web'
  const oldLocation = global.location
  global.location = { origin: connection.baseUrl }
  storage.loadConnection.mockResolvedValue({ ...connection, kind: 'web', csrfToken: 'old-csrf' })
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith('/auth/config') ? metadata : { accountId: 'account-b', csrfToken: 'new-csrf' },
  }))
  try {
    await expect(account.connectAccount(connection.baseUrl)).rejects.toThrow('previous account')
    expect(storage.saveConnection).not.toHaveBeenCalled()
    expect(storage.clearPlan).not.toHaveBeenCalled()
  } finally {
    global.location = oldLocation
  }
})
