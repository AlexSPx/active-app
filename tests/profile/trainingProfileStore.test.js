const mockValues = new Map()
const mockReadFailures = new Map()
const mockWriteFailures = new Map()
const mockWriteBarriers = new Map()

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key) => {
      const failures = mockReadFailures.get(key) || 0
      if (failures > 0) {
        mockReadFailures.set(key, failures - 1)
        throw new Error(`read failed: ${key}`)
      }
      return mockValues.get(key) ?? null
    }),
    setItem: jest.fn(async (key, value) => {
      const failures = mockWriteFailures.get(key) || 0
      if (failures > 0) {
        mockWriteFailures.set(key, failures - 1)
        throw new Error(`write failed: ${key}`)
      }
      const barrier = mockWriteBarriers.get(key)
      if (barrier) {
        barrier.started()
        await barrier.wait
      }
      mockValues.set(key, value)
      barrier?.completed?.()
    }),
  },
}))

const ALICE = 'account:alice'
const BOB = 'account:bob'

function key(ownerId) {
  return `training-profile-storage:${encodeURIComponent(ownerId)}`
}

function persisted(state) {
  return JSON.stringify({ state, version: 0 })
}

function boot(ownerId) {
  jest.resetModules()
  const profileScope = require('../../lib/profileScope')
  profileScope.setActiveProfileOwner(ownerId)
  const storeModule = require('../../features/training-profile/stores/trainingProfileStore')
  return {
    store: storeModule.useTrainingProfileStore,
    hydrate: storeModule.hydrateTrainingProfileStore,
    profileScope,
  }
}

beforeEach(() => {
  mockValues.clear()
  mockReadFailures.clear()
  mockWriteFailures.clear()
  mockWriteBarriers.clear()
})

test('profile updates resolve after the owner-scoped write and leave state unchanged on failure', async () => {
  const app = boot(ALICE)
  await app.hydrate(ALICE)
  const storageKey = key(ALICE)
  let notifyStarted
  let releaseWrite
  const writeStarted = new Promise((resolve) => (notifyStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  mockWriteBarriers.set(storageKey, { started: notifyStarted, wait: writeGate })

  const save = app.store.getState().updateProfile({ firstName: 'Alice' })
  await writeStarted
  expect(app.store.getState().firstName).toBe('')
  releaseWrite()
  await save
  expect(app.store.getState().firstName).toBe('Alice')
  expect(JSON.parse(mockValues.get(storageKey)).state.firstName).toBe('Alice')

  mockWriteBarriers.delete(storageKey)
  mockWriteFailures.set(storageKey, 1)
  await expect(app.store.getState().updateProfile({ lastName: 'Liddell' })).rejects.toThrow(
    'write failed'
  )
  expect(app.store.getState()).toMatchObject({ firstName: 'Alice', lastName: '' })
  expect(JSON.parse(mockValues.get(storageKey)).state).toMatchObject({
    firstName: 'Alice',
    lastName: '',
  })
})

test('onboarding completes only after its owner-scoped row is durable', async () => {
  const app = boot(ALICE)
  await app.hydrate(ALICE)
  let notifyStarted
  let releaseWrite
  const writeStarted = new Promise((resolve) => (notifyStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  mockWriteBarriers.set(key(ALICE), { started: notifyStarted, wait: writeGate })

  const completion = app.store.getState().completeOnboarding()
  await writeStarted
  expect(app.store.getState().onboardingCompleted).toBe(false)
  releaseWrite()
  await completion
  expect(app.store.getState().onboardingCompleted).toBe(true)
  expect(JSON.parse(mockValues.get(key(ALICE))).state.onboardingCompleted).toBe(true)
})

test('a failed restore blocks writes and retry restores the cached row without replacing it with defaults', async () => {
  const storageKey = key(ALICE)
  const saved = persisted({
    firstName: 'Cached',
    lastName: 'Owner',
    onboardingCompleted: true,
  })
  mockValues.set(storageKey, saved)
  mockReadFailures.set(storageKey, 1)

  const app = boot(ALICE)
  await expect(app.hydrate(ALICE)).rejects.toThrow('read failed')
  expect(app.store.getState()).toMatchObject({ firstName: '', onboardingCompleted: false })
  expect(mockValues.get(storageKey)).toBe(saved)
  await expect(app.store.getState().updateProfile({ firstName: 'Overwrite' })).rejects.toThrow(
    'not ready'
  )
  expect(mockValues.get(storageKey)).toBe(saved)

  await app.hydrate(ALICE)
  expect(app.store.getState()).toMatchObject({
    firstName: 'Cached',
    lastName: 'Owner',
    onboardingCompleted: true,
  })
  expect(mockValues.get(storageKey)).toBe(saved)
})

test('cached-user seeding only creates a missing owner row', async () => {
  const app = boot(ALICE)
  await app.hydrate(ALICE)
  await expect(
    app.store.getState().seedProfileIfMissing({ firstName: 'Alice', onboardingCompleted: true })
  ).resolves.toBe(true)
  expect(JSON.parse(mockValues.get(key(ALICE))).state).toMatchObject({
    firstName: 'Alice',
    onboardingCompleted: true,
  })

  await expect(
    app.store
      .getState()
      .seedProfileIfMissing({ firstName: 'Cached User', onboardingCompleted: false })
  ).resolves.toBe(false)
  expect(app.store.getState()).toMatchObject({ firstName: 'Alice', onboardingCompleted: true })
})

test('writes remain isolated to the captured owner across a profile switch', async () => {
  const app = boot(ALICE)
  await app.hydrate(ALICE)
  let notifyStarted
  let releaseWrite
  const writeStarted = new Promise((resolve) => (notifyStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  mockWriteBarriers.set(key(ALICE), { started: notifyStarted, wait: writeGate })

  const saveAlice = app.store.getState().updateProfile({ firstName: 'Alice' })
  await writeStarted
  app.profileScope.setActiveProfileOwner(BOB)
  const restoreBob = app.hydrate(BOB)
  releaseWrite()
  await expect(saveAlice).rejects.toThrow('Profile changed')
  await restoreBob

  expect(app.store.getState()).toMatchObject({ firstName: '', onboardingCompleted: false })
  expect(JSON.parse(mockValues.get(key(ALICE))).state.firstName).toBe('Alice')
  expect(mockValues.has(key(BOB))).toBe(false)
})

test('owner changes do not inherit names and saved onboarding rows cannot be reseeded', async () => {
  const app = boot(ALICE)
  await app.hydrate(ALICE)
  await app.store.getState().updateProfile({ firstName: 'Alice', lastName: 'Owner' })

  app.profileScope.setActiveProfileOwner(BOB)
  await app.hydrate(BOB)
  expect(app.store.getState()).toMatchObject({
    firstName: '',
    lastName: '',
    onboardingCompleted: false,
  })

  await app.store.getState().completeOnboarding()
  await expect(
    app.store.getState().seedProfileIfMissing({ firstName: 'Alice', lastName: 'Owner' })
  ).resolves.toBe(false)
  expect(JSON.parse(mockValues.get(key(BOB))).state).toMatchObject({
    onboardingCompleted: true,
    firstName: '',
    lastName: '',
  })
})
