const React = require('react')
const { act, create } = require('react-test-renderer')
const {
  ProfileSQLiteProvider,
  useProfileDatabaseCleanup,
} = require('../../lib/db/ProfileSQLiteProvider')
const connection = require('../../lib/db/connection')
const sqlite = require('expo-sqlite')

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../../lib/db/connection', () => ({
  markSharedDatabaseProviderMounted: jest.fn(() => 1),
  markSharedDatabaseDetached: jest.fn(),
  markSharedDatabaseCloseFailed: jest.fn(),
}))

beforeEach(() => jest.clearAllMocks())

test('unmount waits for migration and native close before permitting file deletion', async () => {
  let finishMigration
  let finishClose
  const migration = new Promise((resolve) => {
    finishMigration = resolve
  })
  const closing = new Promise((resolve) => {
    finishClose = resolve
  })
  const db = { closeAsync: jest.fn(() => closing) }
  sqlite.openDatabaseAsync.mockResolvedValue(db)
  const onInit = jest.fn(() => migration)
  const onError = jest.fn()
  let root
  await act(async () => {
    root = create(
      React.createElement(
        ProfileSQLiteProvider,
        {
          databaseName: 'profile-test.db',
          onInit,
          onError,
        },
        React.createElement('probe')
      )
    )
  })
  expect(onInit).toHaveBeenCalledWith(db)
  await act(async () => root.unmount())
  expect(db.closeAsync).not.toHaveBeenCalled()
  expect(connection.markSharedDatabaseDetached).not.toHaveBeenCalled()
  await act(async () => finishMigration())
  expect(db.closeAsync).toHaveBeenCalledTimes(1)
  expect(connection.markSharedDatabaseDetached).not.toHaveBeenCalled()
  await act(async () => finishClose())
  expect(connection.markSharedDatabaseDetached).toHaveBeenCalledWith(db, 1)
  expect(onError).not.toHaveBeenCalled()
})

test('initialization failure closes the owned handle exactly once', async () => {
  const db = { closeAsync: jest.fn(async () => {}) }
  sqlite.openDatabaseAsync.mockResolvedValue(db)
  const error = new Error('migration failed')
  const onError = jest.fn()
  let root
  await act(async () => {
    root = create(
      React.createElement(ProfileSQLiteProvider, {
        databaseName: 'profile-test.db',
        onInit: async () => {
          throw error
        },
        onError,
      })
    )
  })
  await act(async () => root.unmount())
  expect(db.closeAsync).toHaveBeenCalledTimes(1)
  expect(connection.markSharedDatabaseDetached).toHaveBeenCalledWith(db, 1)
  expect(onError).toHaveBeenCalledWith(error)
})

test('profile cleanup invalidates immediately and drains work before closing the database', async () => {
  let finishWork
  const work = new Promise((resolve) => {
    finishWork = resolve
  })
  const invalidate = jest.fn()
  const db = { closeAsync: jest.fn(async () => {}) }
  sqlite.openDatabaseAsync.mockResolvedValue(db)
  const cleanup = () => {
    invalidate()
    return work
  }
  function Consumer() {
    useProfileDatabaseCleanup(cleanup)
    return null
  }
  let root
  await act(async () => {
    root = create(
      React.createElement(
        ProfileSQLiteProvider,
        {
          databaseName: 'profile-test.db',
          onInit: async () => {},
          onError: jest.fn(),
        },
        React.createElement(Consumer)
      )
    )
  })
  await act(async () => root.unmount())
  expect(invalidate).toHaveBeenCalled()
  expect(db.closeAsync).not.toHaveBeenCalled()
  await act(async () => finishWork())
  expect(db.closeAsync).toHaveBeenCalledTimes(1)
})
