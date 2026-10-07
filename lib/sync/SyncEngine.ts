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
import { getProfileScope, isCurrentProfile, type ProfileScope } from '../profileScope'

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
type IdRemapListener = (tableName: string, oldId: string, newId: string) => void

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

interface IdRemapRow {
  table_name: string
  old_id: string
  new_id: string
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
  private dbScope: ProfileScope | null = null
  private lifecycleGeneration = 0
  private initialized = false
  private uploadsEnabled = true
  private enableAfterInit = false
  private paused = false
  private resumeAfterDrain = false
  private drainPromise: Promise<void> | null = null
  private appStateSubscription: { remove(): void } | null = null
  // ponytail: one save/remap lock; split per table only if contention appears.
  private idRemapLock: Promise<void> = Promise.resolve()
  private remappedIds = new Map<string, string>()
  private idRemapListeners = new Set<IdRemapListener>()
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
    }
  ) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Must be called once during app bootstrap (in Provider useEffect).
   * Registers listeners and kicks off an initial queue drain.
   */
  async init(db: SQLiteDatabase, options: InitOptions = {}): Promise<void> {
    const lifecycleGeneration = ++this.lifecycleGeneration
    const scope = getProfileScope()
    if (
      this.db !== db ||
      this.dbScope?.ownerId !== scope.ownerId ||
      this.dbScope?.generation !== scope.generation
    ) {
      this.remappedIds.clear()
    }
    this.db = db
    this.dbScope = scope
    this.initialized = false

    // Ensure pragmas on this handle
    await db.execAsync('PRAGMA foreign_keys = ON;')
    if (lifecycleGeneration !== this.lifecycleGeneration || !this.isCurrentEngine(db, scope)) return

    // Restore aliases before processing the queue or hydrating persisted state.
    const idRemaps = await db.getAllAsync<IdRemapRow>(
      'SELECT table_name, old_id, new_id FROM id_remaps'
    )
    if (lifecycleGeneration !== this.lifecycleGeneration || !this.isCurrentEngine(db, scope)) return
    for (const remap of idRemaps) {
      this.remappedIds.set(`${remap.table_name}:${remap.old_id}`, remap.new_id)
      this.emitIdRemap(remap.table_name, remap.old_id, remap.new_id)
    }

    // Listen to app-state transitions (process queue on resume)
    this.appStateSubscription?.remove()
    this.appStateSubscription = this.deps.addAppStateListener(this.handleAppStateChange)
    this.initialized = true

    // Drain any jobs left over from a previous session
    if (options.processOnInit !== false || this.enableAfterInit) {
      this.enableAfterInit = false
      this.processQueueInBackground()
    }
  }

  setUploadsEnabled(enabled: boolean): void {
    this.uploadsEnabled = enabled
    if (!enabled) {
      this.enableAfterInit = false
      this.resumeAfterDrain = false
      return
    }
    if (this.paused) {
      if (this.drainPromise) {
        this.resumeAfterDrain = true
        return
      }
      this.paused = false
    }
    if (this.initialized) this.processQueueInBackground()
    else this.enableAfterInit = true
  }

  async pauseAndDrain(): Promise<void> {
    this.paused = true
    this.resumeAfterDrain = false
    this.uploadsEnabled = false
    this.enableAfterInit = false
    if (this.drainPromise) await this.drainPromise
  }

  destroy(): void {
    this.lifecycleGeneration += 1
    this.appStateSubscription?.remove()
    this.appStateSubscription = null
    this.initialized = false
    this.enableAfterInit = false
    this.db = null
    this.dbScope = null
  }

  private isCurrentEngine(db: SQLiteDatabase, scope: ProfileScope): boolean {
    return (
      this.db === db &&
      this.dbScope?.ownerId === scope.ownerId &&
      this.dbScope?.generation === scope.generation &&
      isCurrentProfile(scope)
    )
  }

  private processQueueInBackground(): void {
    void this.processQueue().catch((error) => {
      console.error('[SyncEngine] Background queue drain failed:', error)
    })
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

  onIdRemap(cb: IdRemapListener): () => void {
    this.idRemapListeners.add(cb)
    return () => this.idRemapListeners.delete(cb)
  }

  async withIdRemapLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.idRemapLock
    let release!: () => void
    this.idRemapLock = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  resolveId(tableName: string, id: string): string {
    let resolvedId = id
    let nextId = this.remappedIds.get(`${tableName}:${resolvedId}`)
    while (nextId) {
      resolvedId = nextId
      nextId = this.remappedIds.get(`${tableName}:${resolvedId}`)
    }
    return resolvedId
  }

  clearIdRemaps(): void {
    this.remappedIds.clear()
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
  async enqueue(job: SyncJobConfig, db: SQLiteDatabase | null = this.db): Promise<void> {
    if (!db) {
      console.warn('[SyncEngine] enqueue called before init — ignoring')
      return
    }
    const scope = db === this.db ? this.dbScope : null

    const id = Date.now().toString(36) + Math.random().toString(36).substring(2)
    const idempotencyKey = `${job.apiMethod}-${Date.now()}-${Math.random().toString(36).substring(2)}`
    const payloadStr = JSON.stringify(job.payload)

    // Validate table name if provided
    if (job.localTable && !(ALLOWED_TABLES as readonly string[]).includes(job.localTable)) {
      console.error(`[SyncEngine] Rejected invalid table name: ${job.localTable}`)
      return
    }

    await db.runAsync(
      `INSERT INTO sync_queue (id, endpoint, method, payload, local_table, local_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      job.apiMethod as string,
      'API',
      payloadStr,
      job.localTable || null,
      job.localId || null,
      idempotencyKey
    )

    // Fire-and-forget — errors are handled internally
    if (scope && this.isCurrentEngine(db, scope)) this.processQueueInBackground()
  }

  // -----------------------------------------------------------------------
  // Queue Processing
  // -----------------------------------------------------------------------

  async processQueue(): Promise<void> {
    if (this.drainPromise) return this.drainPromise
    const db = this.db
    const scope = this.dbScope
    if (
      !db ||
      !scope ||
      !this.initialized ||
      !this.uploadsEnabled ||
      this.paused ||
      !this.isCurrentEngine(db, scope)
    ) {
      return
    }

    const drain = this.drainQueue(db, scope)
    this.drainPromise = drain
    const finish = () => {
      if (this.drainPromise !== drain) return
      this.drainPromise = null
      const shouldResume = this.resumeAfterDrain
      if (this.resumeAfterDrain) {
        this.resumeAfterDrain = false
        this.paused = false
      }
      const activeScope = this.dbScope
      if (
        (shouldResume || !this.isCurrentEngine(db, scope)) &&
        this.db &&
        activeScope &&
        this.initialized &&
        this.uploadsEnabled &&
        !this.paused &&
        isCurrentProfile(activeScope)
      ) {
        this.processQueueInBackground()
      }
    }
    void drain.then(finish, finish)
    return drain
  }

  private async drainQueue(db: SQLiteDatabase, scope: ProfileScope): Promise<void> {
    if (!this.isCurrentEngine(db, scope) || !this.uploadsEnabled || this.paused) return
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

    if (!this.isCurrentEngine(db, scope) || !this.uploadsEnabled || this.paused) return

    this.emit('sync:start')

    try {
      const pendingJobs = await db.getAllAsync<SyncJob>(
        `SELECT * FROM sync_queue
         WHERE status = ? OR status = ?
         ORDER BY created_at ASC`,
        'pending',
        'failed'
      )
      if (!this.isCurrentEngine(db, scope)) return

      if (pendingJobs.length === 0) {
        this.emit('sync:idle')
        return
      }

      for (const job of pendingJobs) {
        if (!this.isCurrentEngine(db, scope) || !this.uploadsEnabled || this.paused) {
          break
        }
        const success = await this.processJob(job, db, scope)
        if (!success) {
          // Stop processing on first failure to preserve ordering
          break
        }
      }

      if (this.isCurrentEngine(db, scope)) this.emit('sync:complete')
    } catch (error) {
      console.error('[SyncEngine] processQueue error:', error)
      if (this.isCurrentEngine(db, scope)) this.emit('sync:error')
      throw error
    }
  }

  // -----------------------------------------------------------------------
  // Single Job Execution
  // -----------------------------------------------------------------------

  private async processJob(
    job: SyncJob,
    db: SQLiteDatabase,
    scope: ProfileScope
  ): Promise<boolean> {
    if (!this.isCurrentEngine(db, scope)) return false
    await db.runAsync('UPDATE sync_queue SET status = ? WHERE id = ?', 'processing', job.id)
    if (!this.isCurrentEngine(db, scope)) {
      await this.resetPending(db, job.id)
      return false
    }

    // Reload after the previous job's possible ID remaps.
    const currentJob = await db.getFirstAsync<SyncJob>(
      'SELECT * FROM sync_queue WHERE id = ?',
      job.id
    )
    if (!this.isCurrentEngine(db, scope)) {
      await this.resetPending(db, job.id)
      return false
    }
    if (!currentJob) return true

    if (!this.uploadsEnabled || this.paused) {
      await this.resetPending(db, job.id)
      return false
    }

    const methodName = currentJob.endpoint as keyof SyncApi
    const apiFunc = this.deps.api[methodName] as (...args: any[]) => Promise<any>

    if (typeof apiFunc !== 'function') {
      console.error(`[SyncEngine] Unknown API method: ${currentJob.endpoint}`)
      await this.markDeadLetter(db, currentJob, `Unknown API method: ${currentJob.endpoint}`)
      return true
    }

    let args: any[]
    try {
      const parsedPayload = JSON.parse(currentJob.payload)
      args = Array.isArray(parsedPayload) ? parsedPayload : [parsedPayload]
    } catch (error) {
      return this.handleJobError(db, scope, currentJob, error)
    }

    if (!this.isCurrentEngine(db, scope)) {
      await this.resetPending(db, currentJob.id)
      return false
    }

    let response: any
    try {
      response = await apiFunc.apply(this.deps.api, args)
    } catch (error) {
      if ((error as { code?: string })?.code === 'AUTH_SESSION_CHANGED') {
        await this.resetPending(db, currentJob.id)
        return false
      }
      return this.handleJobError(db, scope, currentJob, error)
    }

    if (!this.isCurrentEngine(db, scope)) {
      await this.resetPending(db, currentJob.id)
      return false
    }

    if (response && response.id && currentJob.local_table && currentJob.local_id) {
      await this.remapId(
        db,
        scope,
        currentJob.local_table,
        currentJob.local_id,
        response.id,
        currentJob.id
      )
    }

    if (
      response?.workoutRecord?.id &&
      currentJob.local_table === 'workout_records' &&
      currentJob.local_id
    ) {
      await this.remapId(
        db,
        scope,
        'workout_records',
        currentJob.local_id,
        response.workoutRecord.id,
        currentJob.id
      )
    }

    if (!this.isCurrentEngine(db, scope)) {
      await this.resetPending(db, currentJob.id)
      return false
    }
    await db.runAsync('DELETE FROM sync_queue WHERE id = ?', currentJob.id)
    console.log(`[SyncEngine] ✓ ${currentJob.endpoint}`)
    return true
  }

  // -----------------------------------------------------------------------
  // ID Remapping (safe)
  // -----------------------------------------------------------------------

  private async remapId(
    db: SQLiteDatabase,
    scope: ProfileScope,
    tableName: string,
    oldId: string,
    newId: string,
    sourceJobId?: string
  ): Promise<void> {
    return this.withIdRemapLock(async () => {
      if (!this.isCurrentEngine(db, scope)) return

      // Allowlist check (defense-in-depth; already validated at enqueue)
      if (!(ALLOWED_TABLES as readonly string[]).includes(tableName)) {
        console.error(`[SyncEngine] remapId rejected table: ${tableName}`)
        return
      }

      await db.withTransactionAsync(async () => {
        if (!this.isCurrentEngine(db, scope)) return
        const serverWorkoutAlreadyHydrated =
          tableName === 'workouts' &&
          oldId !== newId &&
          (await db.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE id = ?', newId))

        if (!this.isCurrentEngine(db, scope)) return
        if (serverWorkoutAlreadyHydrated) {
          // Hydration can insert the server row before this create job returns.
          await db.runAsync(
            'UPDATE workout_records SET workout_id = ? WHERE workout_id = ?',
            newId,
            oldId
          )
          if (!this.isCurrentEngine(db, scope)) return
          await db.runAsync('DELETE FROM workouts WHERE id = ?', oldId)
        } else {
          // Use a safe, compile-time known query for each table
          const query = `UPDATE "${tableName}" SET id = ? WHERE id = ?`
          await db.runAsync(query, newId, oldId)
        }

        if (!this.isCurrentEngine(db, scope)) return
        if (tableName === 'workouts') {
          await this.remapJsonReferences(db, scope, 'workouts', 'workout_template', oldId, newId)
          await this.remapJsonReferences(db, scope, 'routines', 'pattern', oldId, newId)
        }

        // Mark as synced
        if (!this.isCurrentEngine(db, scope)) return
        await db.runAsync(
          `UPDATE "${tableName}" SET is_synced = 1, synced_at = ? WHERE id = ?`,
          new Date().toISOString(),
          newId
        )

        await this.rewriteQueuedPayloadReferences(db, scope, oldId, newId, sourceJobId)
        if (!this.isCurrentEngine(db, scope)) return
        if (oldId !== newId) {
          await db.runAsync(
            'INSERT OR REPLACE INTO id_remaps (table_name, old_id, new_id) VALUES (?, ?, ?)',
            tableName,
            oldId,
            newId
          )
        }
      })

      if (!this.isCurrentEngine(db, scope)) return
      if (oldId !== newId) this.remappedIds.set(`${tableName}:${oldId}`, newId)
      this.emitIdRemap(tableName, oldId, newId)

      console.log(`[SyncEngine] Remapped ${tableName}: ${oldId} → ${newId}`)
    })
  }

  private emitIdRemap(tableName: string, oldId: string, newId: string): void {
    this.idRemapListeners.forEach((listener) => {
      try {
        listener(tableName, oldId, newId)
      } catch (error) {
        console.error('[SyncEngine] ID remap listener failed:', error)
      }
    })
  }

  private async remapJsonReferences(
    db: SQLiteDatabase,
    scope: ProfileScope,
    tableName: 'workouts' | 'routines',
    columnName: 'workout_template' | 'pattern',
    oldId: string,
    newId: string
  ): Promise<void> {
    if (!this.isCurrentEngine(db, scope) || oldId === newId) return

    const where = tableName === 'workouts' ? ' WHERE id = ?' : ''
    // ponytail: scan routine JSON while the table stays small; index workout references if it grows.
    const rows = await db.getAllAsync<{ id: string; value: string | null }>(
      `SELECT id, "${columnName}" AS value FROM "${tableName}"${where}`,
      ...(where ? [newId] : [])
    )
    if (!this.isCurrentEngine(db, scope)) return
    for (const row of rows) {
      if (!this.isCurrentEngine(db, scope)) return
      if (!row.value) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(row.value)
      } catch (error) {
        console.warn(
          `[SyncEngine] Could not remap ${tableName}.${columnName} JSON for ${row.id}:`,
          error
        )
        continue
      }
      const rewritten = replaceQueuedIdReferences(parsed, oldId, newId)
      if (rewritten.changed) {
        await db.runAsync(
          `UPDATE "${tableName}" SET "${columnName}" = ? WHERE id = ?`,
          JSON.stringify(rewritten.value),
          row.id
        )
      }
    }
  }

  private async rewriteQueuedPayloadReferences(
    db: SQLiteDatabase,
    scope: ProfileScope,
    oldId: string,
    newId: string,
    sourceJobId?: string
  ): Promise<void> {
    if (!this.isCurrentEngine(db, scope) || oldId === newId) return

    const queuedJobs = await db.getAllAsync<Pick<SyncJob, 'id' | 'payload'>>(
      `SELECT id, payload
       FROM sync_queue
       WHERE (status = ? OR status = ?)
         AND id != ?`,
      'pending',
      'failed',
      sourceJobId || ''
    )
    if (!this.isCurrentEngine(db, scope)) return

    for (const queuedJob of queuedJobs) {
      if (!this.isCurrentEngine(db, scope)) return
      let parsedPayload: unknown
      try {
        parsedPayload = JSON.parse(queuedJob.payload)
      } catch (error) {
        console.warn(
          `[SyncEngine] Failed to parse queued payload for remap (${queuedJob.id})`,
          error
        )
        continue
      }

      const { value: rewrittenPayload, changed } = replaceQueuedIdReferences(
        parsedPayload,
        oldId,
        newId
      )

      if (!changed) continue

      await db.runAsync(
        'UPDATE sync_queue SET payload = ? WHERE id = ?',
        JSON.stringify(rewrittenPayload),
        queuedJob.id
      )
    }
  }

  // -----------------------------------------------------------------------
  // Error Handling
  // -----------------------------------------------------------------------

  private async handleJobError(
    db: SQLiteDatabase,
    scope: ProfileScope,
    job: SyncJob,
    error: any
  ): Promise<boolean> {
    if (!this.isCurrentEngine(db, scope)) {
      await this.resetPending(db, job.id)
      return false
    }

    const newRetryCount = job.retry_count + 1
    const errorMsg = error?.message || 'Unknown error'
    const statusCode = error?.status as number | undefined

    // Permanent failures (4xx except 408, 429) — dead-letter immediately
    if (
      statusCode &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 429
    ) {
      console.error(`[SyncEngine] Permanent failure [${job.endpoint}]: ${statusCode} ${errorMsg}`)
      await this.markDeadLetter(db, job, `${statusCode}: ${errorMsg}`)
      return true // continue to next job — this one can't be retried
    }

    // Retryable failure
    if (newRetryCount >= MAX_RETRIES) {
      console.error(`[SyncEngine] Max retries reached [${job.endpoint}]`)
      await this.markDeadLetter(db, job, errorMsg)
      return true // continue to next job
    }

    console.warn(
      `[SyncEngine] Retryable failure [${job.endpoint}] attempt ${newRetryCount}/${MAX_RETRIES}: ${errorMsg}`
    )
    await db.runAsync(
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?',
      'failed',
      newRetryCount,
      errorMsg,
      job.id
    )

    // Stop processing to preserve ordering (will retry on next trigger)
    return false
  }

  private async markDeadLetter(db: SQLiteDatabase, job: SyncJob, errorMsg: string): Promise<void> {
    await db.runAsync(
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?',
      'dead_letter',
      job.retry_count + 1,
      errorMsg,
      job.id
    )
  }

  private async resetPending(db: SQLiteDatabase, jobId: string): Promise<void> {
    await db.runAsync('UPDATE sync_queue SET status = ? WHERE id = ?', 'pending', jobId)
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
      this.processQueueInBackground()
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const syncEngine = new SyncEngine()
