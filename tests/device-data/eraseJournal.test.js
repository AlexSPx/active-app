import {
  completePendingDeviceErase,
  DEVICE_DATA_ERASE_PENDING_KEY,
} from '../../lib/db/eraseJournal'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => values.delete(key),
    setItem: async (key, value) => values.set(key, value),
    values,
  }
}

test('a failed partial erase stays pending across restart until retry removes all owner data', async () => {
  const settingsKey = 'settings-storage:old%3Aaccount'
  const databaseKey = 'profile-old%3Aaccount.db'
  const storage = createStorage({
    [DEVICE_DATA_ERASE_PENDING_KEY]: 'started',
    [settingsKey]: 'retained owner settings',
    [databaseKey]: 'retained owner database',
  })
  const hydratedOwnerData = []
  const openedOwnerData = []

  const startProfile = async (eraseOwnerData) => {
    const state = { ready: false, clean: false }
    try {
      await completePendingDeviceErase(storage, eraseOwnerData)
      hydratedOwnerData.push(await storage.getItem(settingsKey))
      openedOwnerData.push(await storage.getItem(databaseKey))
      state.ready = true
      state.clean = (await storage.getItem(DEVICE_DATA_ERASE_PENDING_KEY)) === null
    } catch {
      // A failed erase keeps startup from restoring or opening owner data.
    }
    return state
  }

  const partialErase = async () => {
    storage.values.delete(settingsKey)
    throw new Error('injected failure after partial owner-data deletion')
  }

  const firstStart = await startProfile(partialErase)
  expect(firstStart).toEqual({ ready: false, clean: false })
  expect(await storage.getItem(DEVICE_DATA_ERASE_PENDING_KEY)).toBe('started')
  expect(await storage.getItem(settingsKey)).toBeNull()
  expect(await storage.getItem(databaseKey)).toBe('retained owner database')
  expect(hydratedOwnerData).toEqual([])
  expect(openedOwnerData).toEqual([])

  const restartedStart = await startProfile(async () => {
    throw new Error('injected erase failure during restart')
  })
  expect(restartedStart).toEqual({ ready: false, clean: false })
  expect(await storage.getItem(DEVICE_DATA_ERASE_PENDING_KEY)).toBe('started')
  expect(await storage.getItem(databaseKey)).toBe('retained owner database')
  expect(hydratedOwnerData).toEqual([])
  expect(openedOwnerData).toEqual([])

  let retryCalls = 0
  const retryErase = async () => {
    retryCalls += 1
    storage.values.delete(settingsKey)
    storage.values.delete(databaseKey)
  }
  const retriedStart = await startProfile(retryErase)
  expect(retriedStart).toEqual({ ready: true, clean: true })
  expect(retryCalls).toBe(1)
  expect(await storage.getItem(DEVICE_DATA_ERASE_PENDING_KEY)).toBeNull()
  expect(await storage.getItem(settingsKey)).toBeNull()
  expect(await storage.getItem(databaseKey)).toBeNull()
  expect(hydratedOwnerData).toEqual([null])
  expect(openedOwnerData).toEqual([null])

  const eraseIfStillPending = jest.fn(async () => {
    throw new Error('completed erase should not run again')
  })
  await expect(completePendingDeviceErase(storage, eraseIfStillPending)).resolves.toBe(false)
  expect(eraseIfStillPending).not.toHaveBeenCalled()
})
