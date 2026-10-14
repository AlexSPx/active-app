const fs = require('fs')
const os = require('os')
const path = require('path')

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../../lib/db/connection', () => ({ getDatabase: jest.fn() }))
jest.mock('../../services/apiService', () => ({
  apiService: {
    getUser: jest.fn(),
    updateCurrentUser: jest.fn(),
    deleteAccount: jest.fn(),
  },
}))

const { Platform } = require('react-native')
const { getDatabase } = require('../../lib/db/connection')
const { apiService } = require('../../services/apiService')
const { initializeLocalUser } = require('../../lib/db/migrations')
const { UserRepository } = require('../../lib/repositories/UserRepository')
const { setActiveProfileOwner } = require('../../lib/profileScope')

const { SqliteDb } = require('../helpers/sqliteDb')

const seed = {
  id: 'local-user',
  email: 'local@example.test',
  username: 'local',
  firstName: 'Local',
  lastName: 'User',
  createdAt: '2026-10-14T00:00:00.000Z',
  timezone: null,
  registrationCompleted: false,
  notificationFrequency: 1,
}

describe('UserRepository local SQLite behavior', () => {
  let temporaryDirectory
  let databases

  function createDatabase(name = 'profile.db') {
    const db = new SqliteDb(path.join(temporaryDirectory, name))
    databases.push(db)
    return db
  }

  async function createProfileTable(db) {
    await db.execAsync(`
      CREATE TABLE user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_json TEXT NOT NULL
      );
    `)
  }

  beforeEach(() => {
    Platform.OS = 'ios'
    setActiveProfileOwner('account:alice')
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'active-user-repository-'))
    databases = []
    getDatabase.mockReset()
    apiService.getUser.mockReset()
    apiService.updateCurrentUser.mockReset()
    apiService.deleteAccount.mockReset()
  })

  afterEach(async () => {
    await Promise.all(databases.map((db) => db.closeAsync()))
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  it('initializes once and reloads the saved local profile after reopening SQLite', async () => {
    const db = createDatabase()
    await createProfileTable(db)
    getDatabase.mockResolvedValue(db)

    await initializeLocalUser(db, seed)
    await initializeLocalUser(db, { ...seed, username: 'replacement' })
    expect(await new UserRepository().getCurrentUser()).toEqual(seed)

    await db.closeAsync()
    const reopenedDb = createDatabase()
    getDatabase.mockResolvedValue(reopenedDb)
    expect(await new UserRepository().getCurrentUser()).toEqual(seed)
    expect(apiService.getUser).not.toHaveBeenCalled()
  })

  it('fails reads and updates when startup did not initialize a profile row', async () => {
    const db = createDatabase()
    await createProfileTable(db)
    getDatabase.mockResolvedValue(db)
    const repository = new UserRepository()

    await expect(repository.getCurrentUser()).rejects.toThrow(
      'No local user profile has been initialized'
    )
    await expect(repository.updateCurrentUser({ firstName: 'Changed' })).rejects.toThrow(
      'No local user profile has been initialized'
    )
  })

  it('merges supported update fields and rejects a failed transactional write', async () => {
    const db = createDatabase()
    await createProfileTable(db)
    await initializeLocalUser(db, seed)
    getDatabase.mockResolvedValue(db)
    const repository = new UserRepository()

    const updated = await repository.updateCurrentUser({
      firstName: 'Updated',
      measurements: { weightKg: 70, heightCm: 175 },
      notificationFrequency: 3,
      registrationCompleted: true,
      baseVersion: 12,
    })
    expect(updated).toMatchObject({
      ...seed,
      firstName: 'Updated',
      measurements: { weightKg: 70, heightCm: 175 },
      notificationFrequency: 3,
      registrationCompleted: true,
    })
    expect(await repository.getCurrentUser()).toEqual(updated)

    await db.execAsync(`
      CREATE TRIGGER reject_user_profile_update
      BEFORE UPDATE ON user_profile
      BEGIN
        SELECT RAISE(ABORT, 'write rejected');
      END;
    `)
    await expect(repository.updateCurrentUser({ firstName: 'Must not succeed' })).rejects.toThrow(
      'write rejected'
    )
    expect(await repository.getCurrentUser()).toEqual(updated)
  })

  it('rejects an operation after its captured owner scope becomes stale', async () => {
    const db = createDatabase()
    await createProfileTable(db)
    await initializeLocalUser(db, seed)
    getDatabase.mockResolvedValue(db)
    const originalGetFirstAsync = db.getFirstAsync.bind(db)
    let queryStarted
    let resumeQuery
    const started = new Promise((resolve) => {
      queryStarted = resolve
    })
    const waitForResume = new Promise((resolve) => {
      resumeQuery = resolve
    })
    db.getFirstAsync = async (...args) => {
      queryStarted()
      await waitForResume
      return originalGetFirstAsync(...args)
    }

    const pendingRead = new UserRepository().getCurrentUser()
    await started
    setActiveProfileOwner('account:bob')
    resumeQuery()
    await expect(pendingRead).rejects.toThrow('Profile changed during user repository operation')
  })

  it('keeps profiles isolated in their owner databases', async () => {
    const aliceDb = createDatabase('alice.db')
    const bobDb = createDatabase('bob.db')
    await Promise.all([createProfileTable(aliceDb), createProfileTable(bobDb)])

    setActiveProfileOwner('account:alice')
    await initializeLocalUser(aliceDb, seed)
    setActiveProfileOwner('account:bob')
    await initializeLocalUser(bobDb, { ...seed, id: 'bob', username: 'bob' })

    getDatabase.mockResolvedValue(bobDb)
    expect(await new UserRepository().getCurrentUser()).toMatchObject({
      id: 'bob',
      username: 'bob',
    })
    setActiveProfileOwner('account:alice')
    getDatabase.mockResolvedValue(aliceDb)
    expect(await new UserRepository().getCurrentUser()).toMatchObject({
      id: 'local-user',
      username: 'local',
    })
  })

  it('preserves both fields when local saves overlap', async () => {
    const db = createDatabase()
    await createProfileTable(db)
    await initializeLocalUser(db, seed)
    getDatabase.mockResolvedValue(db)
    const originalQuery = db.getFirstAsync.bind(db)
    let startRead, releaseRead
    const started = new Promise((resolve) => {
      startRead = resolve
    })
    const gate = new Promise((resolve) => {
      releaseRead = resolve
    })
    let blocked = false
    db.getFirstAsync = async (...args) => {
      if (!blocked && args[0].includes('FROM user_profile')) {
        blocked = true
        startRead()
        await gate
      }
      return originalQuery(...args)
    }
    const repository = new UserRepository()
    const first = repository.updateCurrentUser({ firstName: 'Concurrent' })
    await started
    const second = repository.updateCurrentUser({ notificationFrequency: 0 })
    releaseRead()
    await Promise.all([first, second])
    expect(await repository.getCurrentUser()).toMatchObject({
      firstName: 'Concurrent',
      notificationFrequency: 0,
    })
  })

  it('rejects a queued update for the old owner before it can write the new owner', async () => {
    const alice = createDatabase('queued-alice.db')
    const bob = createDatabase('queued-bob.db')
    await Promise.all([createProfileTable(alice), createProfileTable(bob)])
    await initializeLocalUser(alice, seed)
    await initializeLocalUser(bob, { ...seed, id: 'bob', firstName: 'Bob' })
    getDatabase.mockResolvedValue(alice)
    const originalQuery = alice.getFirstAsync.bind(alice)
    let startRead, releaseRead
    const started = new Promise((resolve) => {
      startRead = resolve
    })
    const gate = new Promise((resolve) => {
      releaseRead = resolve
    })
    alice.getFirstAsync = async (...args) => {
      if (args[0].includes('FROM user_profile')) {
        startRead()
        await gate
      }
      return originalQuery(...args)
    }
    const repository = new UserRepository()
    const first = repository.updateCurrentUser({ firstName: 'Old owner' })
    await started
    const second = repository.updateCurrentUser({ lastName: 'Must not leak' })
    const outcomes = Promise.allSettled([first, second])
    setActiveProfileOwner('account:bob')
    getDatabase.mockResolvedValue(bob)
    releaseRead()
    expect((await outcomes).map(({ status }) => status)).toEqual(['rejected', 'rejected'])
    expect(
      JSON.parse(
        (await bob.getFirstAsync('SELECT user_json FROM user_profile WHERE id = 1')).user_json
      )
    ).toMatchObject({ firstName: 'Bob', lastName: 'User' })
  })

  it('continues to use the API on web', async () => {
    Platform.OS = 'web'
    apiService.getUser.mockResolvedValue(seed)
    apiService.updateCurrentUser.mockResolvedValue({ ...seed, firstName: 'Web' })
    apiService.deleteAccount.mockResolvedValue(undefined)
    const repository = new UserRepository()

    expect(await repository.getCurrentUser()).toEqual(seed)
    expect(await repository.updateCurrentUser({ firstName: 'Web' })).toMatchObject({
      firstName: 'Web',
    })
    await repository.deleteCurrentUser()
    expect(apiService.getUser).toHaveBeenCalledTimes(1)
    expect(apiService.updateCurrentUser).toHaveBeenCalledWith({ firstName: 'Web' })
    expect(apiService.deleteAccount).toHaveBeenCalledTimes(1)
    expect(getDatabase).not.toHaveBeenCalled()
  })
})
