const mockValues = new Map()
const mockWriteFailures = new Map()
const mockWriteBarriers = new Map()
const mockWriteCounts = new Map()

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key) => mockValues.get(key) ?? null),
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
      mockWriteCounts.set(key, (mockWriteCounts.get(key) || 0) + 1)
    }),
    removeItem: jest.fn(async (key) => mockValues.delete(key)),
    multiGet: jest.fn(async (keys) => keys.map((key) => [key, mockValues.get(key) ?? null])),
  },
}))

const OWNER = 'account:settings-test'
const SETTINGS_KEY = `settings-storage:${encodeURIComponent(OWNER)}`

function boot() {
  jest.resetModules()
  const profileScope = require('../../lib/profileScope')
  const scope = profileScope.setActiveProfileOwner(OWNER)
  const { hydrateProfileStores } = require('../../lib/profileStorage')
  const {
    useSettingsStore,
    saveSettingsProfile,
  } = require('../../features/settings/stores/settingsStore')
  return { scope, profileScope, hydrateProfileStores, useSettingsStore, saveSettingsProfile }
}

beforeEach(() => {
  mockValues.clear()
  mockWriteFailures.clear()
  mockWriteBarriers.clear()
  mockWriteCounts.clear()
})

async function waitForWriteCount(key, count) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((mockWriteCounts.get(key) || 0) >= count) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Expected ${count} writes for ${key}`)
}

test('settings save resolves only after the owner-scoped row is durable', async () => {
  const app = boot()
  await app.hydrateProfileStores(OWNER, OWNER)
  const before = app.useSettingsStore.getState()
  let signalStarted
  let releaseWrite
  const writeStarted = new Promise((resolve) => (signalStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  mockWriteBarriers.set(SETTINGS_KEY, { started: signalStarted, wait: writeGate })

  const save = app.saveSettingsProfile(app.scope, {
    timeZone: 'Europe/Sofia',
    bodyWeight: 82.5,
    height: 181,
    bodyWeightUnit: 'lb',
    heightUnit: 'in',
  })
  await writeStarted
  expect(app.useSettingsStore.getState()).toMatchObject({
    timeZone: before.timeZone,
    bodyWeight: before.bodyWeight,
    height: before.height,
    bodyWeightUnit: before.bodyWeightUnit,
    heightUnit: before.heightUnit,
  })

  releaseWrite()
  await save
  expect(app.useSettingsStore.getState()).toMatchObject({
    timeZone: 'Europe/Sofia',
    bodyWeight: 82.5,
    height: 181,
    bodyWeightUnit: 'lb',
    heightUnit: 'in',
  })
  expect(JSON.parse(mockValues.get(SETTINGS_KEY)).state).toMatchObject({
    timeZone: 'Europe/Sofia',
    bodyWeight: 82.5,
    height: 181,
    bodyWeightUnit: 'lb',
    heightUnit: 'in',
  })
})

test('a rejected settings write leaves the previous draft available for retry', async () => {
  const app = boot()
  await app.hydrateProfileStores(OWNER, OWNER)
  const before = app.useSettingsStore.getState()
  mockWriteFailures.set(SETTINGS_KEY, 1)

  await expect(
    app.saveSettingsProfile(app.scope, {
      timeZone: 'Europe/Sofia',
      bodyWeight: 82.5,
      height: 181,
    })
  ).rejects.toThrow(`write failed: ${SETTINGS_KEY}`)

  expect(app.useSettingsStore.getState()).toMatchObject({
    timeZone: before.timeZone,
    bodyWeight: before.bodyWeight,
    height: before.height,
  })
  expect(mockValues.has(SETTINGS_KEY)).toBe(false)
})

test('a profile switch during settings persistence cannot update the new owner in memory', async () => {
  const app = boot()
  await app.hydrateProfileStores(OWNER, OWNER)
  const before = app.useSettingsStore.getState()
  let signalStarted
  let releaseWrite
  const writeStarted = new Promise((resolve) => (signalStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  mockWriteBarriers.set(SETTINGS_KEY, { started: signalStarted, wait: writeGate })

  const save = app.saveSettingsProfile(app.scope, { timeZone: 'Europe/Sofia', bodyWeight: 82.5 })
  await writeStarted
  app.profileScope.setActiveProfileOwner('account:other')
  releaseWrite()

  await expect(save).rejects.toThrow('Profile changed while saving settings.')
  expect(app.useSettingsStore.getState()).toMatchObject({
    timeZone: before.timeZone,
    bodyWeight: before.bodyWeight,
  })
  expect(mockValues.has(`settings-storage:${encodeURIComponent('account:other')}`)).toBe(false)
})

test('concurrent profile saves serialize disjoint changes into one owner snapshot', async () => {
  const app = boot()
  await app.hydrateProfileStores(OWNER, OWNER)
  let signalStarted
  let releaseWrite
  const writeStarted = new Promise((resolve) => (signalStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  const started = jest.fn(() => signalStarted())
  mockWriteBarriers.set(SETTINGS_KEY, { started, wait: writeGate })

  const weightSave = app.saveSettingsProfile(app.scope, { bodyWeight: 82.5 })
  await writeStarted
  const timeZoneSave = app.saveSettingsProfile(app.scope, { timeZone: 'Asia/Tokyo' })
  expect(started).toHaveBeenCalledTimes(1)

  releaseWrite()
  await Promise.all([weightSave, timeZoneSave])

  expect(started).toHaveBeenCalledTimes(2)
  expect(app.useSettingsStore.getState()).toMatchObject({
    bodyWeight: 82.5,
    timeZone: 'Asia/Tokyo',
  })
  expect(JSON.parse(mockValues.get(SETTINGS_KEY)).state).toMatchObject({
    bodyWeight: 82.5,
    timeZone: 'Asia/Tokyo',
  })
})

test('ordinary settings changes during a profile save persist the combined snapshot', async () => {
  const app = boot()
  await app.hydrateProfileStores(OWNER, OWNER)
  let signalStarted
  let releaseWrite
  const writeStarted = new Promise((resolve) => (signalStarted = resolve))
  const writeGate = new Promise((resolve) => (releaseWrite = resolve))
  const started = jest.fn(() => signalStarted())
  mockWriteBarriers.set(SETTINGS_KEY, { started, wait: writeGate })

  const profileSave = app.saveSettingsProfile(app.scope, { timeZone: 'Asia/Tokyo' })
  await writeStarted
  app.useSettingsStore.getState().setTheme('dark')
  expect(started).toHaveBeenCalledTimes(1)

  releaseWrite()
  await profileSave
  await waitForWriteCount(SETTINGS_KEY, 2)

  expect(app.useSettingsStore.getState()).toMatchObject({ timeZone: 'Asia/Tokyo', theme: 'dark' })
  expect(JSON.parse(mockValues.get(SETTINGS_KEY)).state).toMatchObject({
    timeZone: 'Asia/Tokyo',
    theme: 'dark',
  })
})
