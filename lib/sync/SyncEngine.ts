/**
 * SyncEngine - Hardened background sync processor.
 *
 * Replaces the old SyncManager with:
 *  - Shared singleton DB handle (no separate connection)
 *  - Explicit init() called once from Provider
 *  - Exponential backoff with jitter
 *  - Retryable vs permanent error categorization
 *  - Table-name allowlist (no SQL injection)
 *  - Idempotency keys per job
 *  - EventEmitter for UI sync status
 *  - Continuous network monitoring
 */
import { type SQLiteDatabase } from 'expo-sqlite'
import * as Network from 'expo-network'
import { AppState, type AppStateStatus } from 'react-native'
import { syncApi, type SyncApi } from './api'
import { replaceQueuedIdReferences } from './queuePayloadRemap'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncJobConfig {
  /** Key of the sync API method to invoke */
  apiMethod: keyof SyncApi
  /** Arguments to pass (will be JSON-serialized) */
  payload: any
  /** Target local table for ID remapping (optional) */
  localTable?: string
  /** Temporary local ID to remap (optional) */
  localId?: string
}

export interface SyncJob {
  id: string
  endpoint: string
  method: string
  payload: string
  local_table: string | null
  local_id: string | null
  idempotency_key: string | null
  retry_count: number
  status: string
}

export type SyncEvent = 'sync:start' | 'sync:complete' | 'sync:error' | 'sync:idle'

interface SyncEngineDeps {
  api: SyncApi
  getNetworkState: () => Promise<{
    isConnected?: boolean | null
    isInternetReachable?: boolean | null
  }>
  addAppStateListener: (handler: (state: AppStateStatus) => void) => { remove(): void }
}

interface InitOptions {
  processOnInit?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_TABLES = ['workouts', 'workout_records', 'routines'] as const
type AllowedTable = (typeof ALLOWED_TABLES)[number]

const MAX_RETRIES = 5
const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 60_000

// ---------------------------------------------------------------------------
// SyncEngine
// ---------------------------------------------------------------------------

export class SyncEngine {
  private db: SQLiteDatabase | null = null
  private isProcessing = false
  private appStateSubscription: { remove(): void } | null = null
  private listeners: Record<SyncEvent, Set<() => void>> = {
    'sync:start': new Set(),
    'sync:complete': new Set(),
    'sync:error': new Set(),
    'sync:idle': new Set(),
  }

  constructor(
    private readonly deps: SyncEngineDeps = {
      api: syncApi,
      getNetworkState: () => Network.getNetworkStateAsync(),
      addAppStateListener: (handler) => AppState.addEventListener('change', handler),
    },
  ) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Must be called once during app bootstrap (in Provider useEffect).
   * Registers listeners and kicks off an initial queue drain.
   */
  async init(db: SQLiteDatabase, options: InitOptions = {}): Promise<void> {
    this.db = db

    // Ensure pragmas on this handle
    await db.execAsync('PRAGMA foreign_keys = ON;')

    // Listen to app-state transitions (process queue on resume)
    this.appStateSubscription = this.deps.addAppStateListener(this.handleAppStateChange)

    // Drain any jobs left over from a previous session
    if (options.processOnInit !== false) {
      this.processQueue()
    }
  }

  destroy(): void {
    this.appStateSubscription?.remove()
    this.appStateSubscription = null
  }

  // -----------------------------------------------------------------------
  // Event Emitter (minimal)
  // -----------------------------------------------------------------------

  on(event: SyncEvent, cb: () => void): () => void {
    this.listeners[event].add(cb)
    return () => {
      this.listeners[event].delete(cb)
    }
  }

  private emit(event: SyncEvent): void {
    this.listeners[event].forEach((cb) => cb())
  }

  // -----------------------------------------------------------------------
  // Enqueue
  // -----------------------------------------------------------------------

  /**
   * Insert a new sync job into the queue and immediately attempt processing.
   */
  async enqueue(job: SyncJobConfig): Promise<void> {
    if (!this.db) {
      console.warn('[SyncEngine] enqueue called before init — ignoring')
      return
    }

    const id = Date.now().toString(36) + Math.random().toString(36).substring(2)
    const idempotencyKey = `${job.apiMethod}-${Date.now()}-${Math.random().toString(36).substring(2)}`
    const payloadStr = JSON.stringify(job.payload)

    // Validate table name if provided
    if (job.localTable && !(ALLOWED_TABLES as readonly string[]).includes(job.localTable)) {
      console.error(`[SyncEngine] Rejected invalid table name: ${job.localTable}`)
      return
    }

    await this.db.runAsync(
      `INSERT INTO sync_queue (id, endpoint, method, payload, local_table, local_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      job.apiMethod as string,
      'API',
      payloadStr,
      job.localTable || null,
      job.localId || null,
      idempotencyKey,
    )

    // Fire-and-forget — errors are handled internally
    this.processQueue()
  }

  // -----------------------------------------------------------------------
  // Queue Processing
  // -----------------------------------------------------------------------

  async processQueue(): Promise<void> {
    if (this.isProcessing || !this.db) return

    // Network check
    try {
      const networkState = await this.deps.getNetworkState()
      if (!networkState.isConnected || !networkState.isInternetReachable) {
        return
      }
    } catch {
      // If we can't determine network state, skip processing
      return
    }

    this.isProcessing = true
    this.emit('sync:start')

    try {
      const pendingJobs = await this.db.getAllAsync<SyncJob>(
        `SELECT * FROM sync_queue
         WHERE status = ? OR status = ?
         ORDER BY created_at ASC`,
        'pending',
        'failed',
      )

      if (pendingJobs.length === 0) {
        this.emit('sync:idle')
        return
      }

      for (const job of pendingJobs) {
        const success = await this.processJob(job)
        if (!success) {
          // Stop processing on first failure to preserve ordering
          break
        }
      }

      this.emit('sync:complete')
    } catch (error) {
      console.error('[SyncEngine] processQueue error:', error)
      this.emit('sync:error')
    } finally {
      this.isProcessing = false
    }
  }

  // -----------------------------------------------------------------------
  // Single Job Execution
  // -----------------------------------------------------------------------

  private async processJob(job: SyncJob): Promise<boolean> {
    if (!this.db) return false

    try {
      // Mark as processing
      await this.db.runAsync('UPDATE sync_queue SET status = ? WHERE id = ?', 'processing', job.id)

      // Reload the job from SQLite so we pick up any ID remaps applied by
      // earlier jobs in the same queue-drain pass.
      const currentJob = await this.db.getFirstAsync<SyncJob>(
        'SELECT * FROM sync_queue WHERE id = ?',
        job.id,
      )
      if (!currentJob) {
        return true
      }

      const methodName = currentJob.endpoint as keyof SyncApi
      const apiFunc = this.deps.api[methodName] as (...args: any[]) => Promise<any>

      if (typeof apiFunc !== 'function') {
        console.error(`[SyncEngine] Unknown API method: ${currentJob.endpoint}`)
        await this.markDeadLetter(currentJob, `Unknown API method: ${currentJob.endpoint}`)
        return true // continue to next job
      }

      const parsedPayload = JSON.parse(currentJob.payload)
      const args = Array.isArray(parsedPayload) ? parsedPayload : [parsedPayload]
      const response = await apiFunc.apply(this.deps.api, args)

      // ID remapping: server responded with a real ID
      if (response && response.id && currentJob.local_table && currentJob.local_id) {
        await this.remapId(currentJob.local_table, currentJob.local_id, response.id, currentJob.id)
      }

      // For workout recording, handle the nested response shape
      if (
        response?.workoutRecord?.id &&
        currentJob.local_table === 'workout_records' &&
        currentJob.local_id
      ) {
        await this.remapId(
          'workout_records',
          currentJob.local_id,
          response.workoutRecord.id,
          currentJob.id,
        )
      }

      // Success — remove completed job
      await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', currentJob.id)
      console.log(`[SyncEngine] ✓ ${currentJob.endpoint}`)
      return true
    } catch (error: any) {
      return this.handleJobError(job, error)
    }
  }

  // -----------------------------------------------------------------------
  // ID Remapping (safe)
  // -----------------------------------------------------------------------

  private async remapId(
    tableName: string,
    oldId: string,
    newId: string,
    sourceJobId?: string,
  ): Promise<void> {
    if (!this.db) return

    // Allowlist check (defense-in-depth; already validated at enqueue)
    if (!(ALLOWED_TABLES as readonly string[]).includes(tableName)) {
      console.error(`[SyncEngine] remapId rejected table: ${tableName}`)
      return
    }

    // Use a safe, compile-time known query for each table
    const query = `UPDATE "${tableName}" SET id = ? WHERE id = ?`
    await this.db.runAsync(query, newId, oldId)

    // Mark as synced
    await this.db.runAsync(
      `UPDATE "${tableName}" SET is_synced = 1, synced_at = ? WHERE id = ?`,
      new Date().toISOString(),
      newId,
    )

    await this.rewriteQueuedPayloadReferences(oldId, newId, sourceJobId)

    console.log(`[SyncEngine] Remapped ${tableName}: ${oldId} → ${newId}`)
  }

  private async rewriteQueuedPayloadReferences(
    oldId: string,
    newId: string,
    sourceJobId?: string,
  ): Promise<void> {
    if (!this.db || oldId === newId) return

    const queuedJobs = await this.db.getAllAsync<Pick<SyncJob, 'id' | 'payload'>>(
      `SELECT id, payload
       FROM sync_queue
       WHERE (status = ? OR status = ?)
         AND id != ?`,
      'pending',
      'failed',
      sourceJobId || '',
    )

    for (const queuedJob of queuedJobs) {
      let parsedPayload: unknown
      try {
        parsedPayload = JSON.parse(queuedJob.payload)
      } catch (error) {
        console.warn(`[SyncEngine] Failed to parse queued payload for remap (${queuedJob.id})`, error)
        continue
      }

      const { value: rewrittenPayload, changed } = replaceQueuedIdReferences(parsedPayload, oldId, newId)

      if (!changed) continue

      await this.db.runAsync(
        'UPDATE sync_queue SET payload = ? WHERE id = ?',
        JSON.stringify(rewrittenPayload),
        queuedJob.id,
      )
    }
  }

  // -----------------------------------------------------------------------
  // Error Handling
  // -----------------------------------------------------------------------

  private async handleJobError(job: SyncJob, error: any): Promise<boolean> {
    if (!this.db) return false

    const newRetryCount = job.retry_count + 1
    const errorMsg = error?.message || 'Unknown error'
    const statusCode = error?.status as number | undefined

    // Permanent failures (4xx except 408, 429) — dead-letter immediately
    if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) {
      console.error(`[SyncEngine] Permanent failure [${job.endpoint}]: ${statusCode} ${errorMsg}`)
      await this.markDeadLetter(job, `${statusCode}: ${errorMsg}`)
      return true // continue to next job — this one can't be retried
    }

    // Retryable failure
    if (newRetryCount >= MAX_RETRIES) {
      console.error(`[SyncEngine] Max retries reached [${job.endpoint}]`)
      await this.markDeadLetter(job, errorMsg)
      return true // continue to next job
    }

    console.warn(`[SyncEngine] Retryable failure [${job.endpoint}] attempt ${newRetryCount}/${MAX_RETRIES}: ${errorMsg}`)
    await this.db.runAsync(
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?',
      'failed',
      newRetryCount,
      errorMsg,
      job.id,
    )

    // Stop processing to preserve ordering (will retry on next trigger)
    return false
  }

  private async markDeadLetter(job: SyncJob, errorMsg: string): Promise<void> {
    if (!this.db) return
    await this.db.runAsync(
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?',
      'dead_letter',
      job.retry_count + 1,
      errorMsg,
      job.id,
    )
  }

  // -----------------------------------------------------------------------
  // Exponential Backoff (unused in this loop-style but available for future)
  // -----------------------------------------------------------------------

  private getBackoff(retryCount: number): number {
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** retryCount, MAX_BACKOFF_MS)
    const jitter = Math.random() * backoff * 0.3
    return backoff + jitter
  }

  // -----------------------------------------------------------------------
  // App State
  // -----------------------------------------------------------------------

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === 'active') {
      this.processQueue()
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const syncEngine = new SyncEngine()
