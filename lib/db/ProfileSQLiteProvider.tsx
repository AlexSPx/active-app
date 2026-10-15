import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as SQLite from 'expo-sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'
import {
  markSharedDatabaseDetached,
  markSharedDatabaseProviderMounted,
  markSharedDatabaseCloseFailed,
} from './connection'

const DatabaseContext = createContext<SQLiteDatabase | null>(null)

export function useProfileDatabase(): SQLiteDatabase {
  const database = useContext(DatabaseContext)
  if (!database) throw new Error('The profile database is not ready.')
  return database
}

export function ProfileSQLiteProvider({
  databaseName,
  onInit,
  onError,
  children,
}: {
  databaseName: string
  onInit: (database: SQLiteDatabase) => Promise<void>
  onError: (error: Error) => void
  children: ReactNode
}) {
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null)

  useEffect(() => {
    let active = true
    let openedDatabase: SQLiteDatabase | null = null
    const providerToken = markSharedDatabaseProviderMounted()

    let closeOperation: Promise<void> | null = null
    const close = (): Promise<void> => {
      if (closeOperation) return closeOperation
      closeOperation = (async () => {
        const db = openedDatabase
        if (!db) {
          markSharedDatabaseDetached(null, providerToken)
          return
        }
        try {
          await db.closeAsync()
          markSharedDatabaseDetached(db, providerToken)
        } catch (cause) {
          markSharedDatabaseCloseFailed(cause, db, providerToken)
          onError(cause instanceof Error ? cause : new Error('Could not close local data.'))
        }
      })()
      return closeOperation
    }

    const initialize = async () => {
      try {
        const db = await SQLite.openDatabaseAsync(databaseName)
        openedDatabase = db
        if (active) await onInit(db)
        if (active) setDatabase(db)
      } catch (cause) {
        if (active) {
          onError(cause instanceof Error ? cause : new Error('Could not open local data.'))
        }
        await close()
      }
    }

    const initialization = initialize()

    return () => {
      active = false
      // Migrations may own a legacy handle: let initialization finish before closing.
      void initialization.then(close)
    }
  }, [databaseName, onError, onInit])

  return (
    <DatabaseContext.Provider value={database}>
      {database ? children : null}
    </DatabaseContext.Provider>
  )
}
