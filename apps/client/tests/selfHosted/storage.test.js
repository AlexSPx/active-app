const mockValues = new Map()
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key) => mockValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => {
    mockValues.set(key, value)
  }),
  deleteItemAsync: jest.fn(async (key) => {
    mockValues.delete(key)
  }),
}))
const { Platform } = require('react-native')
const secure = require('expo-secure-store')
const storage = require('../../features/selfHosted/storage')
const scope = { instanceId: 'server-a', accountId: 'account-a' }
const connection = {
  kind: 'native',
  ...scope,
  baseUrl: 'https://server',
  issuer: 'https://issuer',
  clientId: 'client',
  resource: 'resource',
  authorizationEndpoint: 'https://issuer/auth',
  tokenEndpoint: 'https://issuer/token',
  endSessionEndpoint: null,
  redirectUri: 'app://callback',
  subject: 'subject-a',
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  idToken: null,
  expiresAt: 123,
}
const plan = {
  kind: 'delete',
  plan: {
    accountId: 'account-a',
    request: {
      path: {},
      query: { baseVersion: 1 },
      body: null,
      idempotencyKey: 'key',
    },
  },
}
let session
beforeEach(() => {
  mockValues.clear()
  jest.clearAllMocks()
  Platform.OS = 'ios'
  session = new Map()
  global.sessionStorage = {
    getItem: (key) => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value),
    removeItem: (key) => session.delete(key),
  }
})

test('restores validated credentials and rejects malformed or mismatched records', async () => {
  await storage.saveConnection(connection)
  expect(await storage.loadConnection()).toEqual(connection)
  const key = [...mockValues.keys()].find((k) => k.endsWith('.connection'))
  mockValues.set(key, JSON.stringify({ ...connection, accountId: 'other' }))
  expect(await storage.loadConnection()).toBeNull()
  mockValues.set(key, '{broken')
  expect(await storage.loadConnection()).toBeNull()
})

test('persists and validates plans with instance and account binding', async () => {
  await storage.savePlan(scope, plan)
  expect(await storage.loadPlan(scope, 'delete')).toEqual(plan)
  expect(await storage.loadPlan({ ...scope, instanceId: 'server-b' }, 'delete')).toBeNull()
  await expect(storage.savePlan({ ...scope, accountId: 'other' }, plan)).rejects.toThrow()
  const key = [...mockValues.keys()][0]
  const envelope = JSON.parse(mockValues.get(key))
  envelope.scope.instanceId = 'server-b'
  mockValues.set(key, JSON.stringify(envelope))
  expect(await storage.loadPlan(scope, 'delete')).toBeNull()
  envelope.scope.instanceId = scope.instanceId
  envelope.plan.plan.request.query.baseVersion = -1
  mockValues.set(key, JSON.stringify(envelope))
  expect(await storage.loadPlan(scope, 'delete')).toBeNull()
  await storage.clearPlan(scope, 'delete')
  expect(await storage.loadPlan(scope, 'delete')).toBeNull()
})

test('clearing credentials leaves persisted plans untouched', async () => {
  await storage.saveConnection(connection)
  await storage.savePlan(scope, plan)
  await storage.clearConnection()
  expect(await storage.loadConnection()).toBeNull()
  expect(await storage.loadPlan(scope, 'delete')).toEqual(plan)
  expect(secure.deleteItemAsync).toHaveBeenCalledTimes(2)
})

test('web keeps only nonsecret connection metadata in the tab and rejects token persistence', async () => {
  Platform.OS = 'web'
  await expect(storage.saveConnection(connection)).rejects.toThrow('native-only')
  const { accessToken, refreshToken, idToken, expiresAt, subject, ...metadata } = connection
  const web = { ...metadata, kind: 'web', csrfToken: 'csrf' }
  await storage.saveConnection(web)
  await storage.savePlan(scope, plan)
  expect(await storage.loadConnection()).toEqual(web)
  expect(await storage.loadPlan(scope, 'delete')).toEqual(plan)
  expect(JSON.stringify([...session.values()])).not.toMatch(/access-secret|refresh-secret/)
  expect(secure.setItemAsync).not.toHaveBeenCalled()
  await storage.clearConnection()
  expect(await storage.loadConnection()).toBeNull()
})

test('round trips initialization requests and rejects invalid stages', async () => {
  const init = {
    kind: 'initialize',
    plan: {
      accountId: scope.accountId,
      stage: 'profile',
      profile: {
        path: {},
        query: {},
        body: { baseVersion: 1, firstName: 'Alex' },
        idempotencyKey: 'profile-key',
      },
      preferences: null,
    },
  }
  await storage.savePlan(scope, init)
  expect(await storage.loadPlan(scope, 'initialize')).toEqual(init)
  await expect(
    storage.savePlan(scope, { ...init, plan: { ...init.plan, stage: 'preferences' } })
  ).rejects.toThrow()
})

test('failed active scope write preserves the old credentials and removes the incomplete new record', async () => {
  await storage.saveConnection(connection)
  secure.setItemAsync
    .mockImplementationOnce(async (key, value) => mockValues.set(key, value))
    .mockRejectedValueOnce(new Error('storage failed'))
  await expect(
    storage.saveConnection({ ...connection, instanceId: 'server-b', accountId: 'account-b' })
  ).rejects.toThrow('storage failed')
  expect(await storage.loadConnection()).toEqual(connection)
  expect([...mockValues.keys()].filter((key) => key.endsWith('.connection'))).toHaveLength(1)
})
