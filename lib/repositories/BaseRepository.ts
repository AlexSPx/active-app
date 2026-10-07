/**
 * BaseRepository - Abstract base class for all entity repositories.
 *
 * Provides:
 *  - Shared SQLite DB handle
 *  - SyncEngine integration
 *  - Collision-safe local ID generation
 *  - Helper methods for common DB operations
 */
import { type SQLiteDatabase } from 'expo-sqlite'
import { syncEngine, type SyncJobConfig } from '../sync'

export abstract class BaseRepository {
  constructor(protected db: SQLiteDatabase) {}

  /**
   * Generate a collision-safe temporary local ID.
   * Uses timestamp + random suffix to avoid collisions across offline sessions.
   */
  protected generateLocalId(): string {
    return `local_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`
  }

  /**
   * Enqueue a sync job for the given operation.
   */
  protected async enqueueSync(config: SyncJobConfig): Promise<void> {
    await syncEngine.enqueue(config, this.db)
  }

  /**
   * Run a SELECT query and return all matching rows.
   */
  protected async queryAll<T>(sql: string, ...params: any[]): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, ...params)
  }

  /**
   * Run a SELECT query and return the first matching row (or null).
   */
  protected async queryFirst<T>(sql: string, ...params: any[]): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, ...params)
  }

  /**
   * Run an INSERT / UPDATE / DELETE statement.
   */
  protected async run(sql: string, ...params: any[]): Promise<void> {
    await this.db.runAsync(sql, ...params)
  }
}
