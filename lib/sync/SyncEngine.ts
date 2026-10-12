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
import type { WorkoutRecord } from '../../types/api'
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

interface EnqueueOptions {
  processAfterInsert?: boolean
}

export interface SyncJob {
  id: string
  endpoint: string
  method: string
  payload: string
  request_payload: string | null
  local_table: string | null
  local_id: string | null
  idempotency_key: string | null
  sequence: number
  next_attempt_at: number
  retry_count: number
  status: string
  error_message: string | null
  created_at?: string
  /** UI-safe explanation derived from earlier queued work. */
  blocked_reason?: string
}

export type SyncEvent = 'sync:start' | 'sync:complete' | 'sync:error' | 'sync:idle' | 'sync:change'
type IdRemapListener = (tableName: string, oldId: string, newId: string) => void

interface SyncEngineDeps {
  api: SyncApi
  getNetworkState: () => Promise<{
    isConnected?: boolean | null
    isInternetReachable?: boolean | null
  }>
  addAppStateListener: (handler: (state: AppStateStatus) => void) => { remove(): void }
  addNetworkStateListener?: (handler: (state: Network.NetworkStateEvent) => void) => {
    remove(): void
  }
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

const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 60_000
const NETWORK_PREFLIGHT_TIMEOUT_MS = 3_000
const QUEUE_BATCH_SIZE = 50
const BLOCKED_REASON = 'Blocked by an earlier unsynced change.'

interface JobDependencies {
  primary: string | null
  requires: Set<string>
  unknown: boolean
}

function getJobDependencies(job: SyncJob): JobDependencies {
  const localEntity = job.local_table && job.local_id ? `${job.local_table}:${job.local_id}` : null
  const requires = new Set<string>()
  let payload: unknown
  try {
    payload = JSON.parse(job.request_payload ?? job.payload)
  } catch {
    return { primary: localEntity, requires, unknown: true }
  }

  const args = Array.isArray(payload) ? payload : [payload]
  const id = (value: unknown) => (typeof value === 'string' && value ? value : null)
  const addWorkoutReferences = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(addWorkoutReferences)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'workoutId' && typeof nested === 'string') {
        requires.add(`workouts:${nested}`)
      } else {
        addWorkoutReferences(nested)
      }
    }
  }

  switch (job.endpoint as keyof SyncApi) {
    case 'createWorkout':
      return { primary: localEntity, requires, unknown: !localEntity }
    case 'updateWorkout':
    case 'deleteWorkout': {
      const workoutId = id(args[0])
      return {
        primary: workoutId ? `workouts:${workoutId}` : localEntity,
        requires,
        unknown: !workoutId,
      }
    }
    case 'recordWorkout': {
      const request = args[0]
      if (request && typeof request === 'object') {
        const workoutId = id((request as { workoutId?: unknown }).workoutId)
        if (workoutId) requires.add(`workouts:${workoutId}`)
      }
      return { primary: localEntity, requires, unknown: !localEntity || requires.size === 0 }
    }
    case 'deleteWorkoutRecord': {
      const recordId = id(args[0])
      return {
        primary: recordId ? `workout_records:${recordId}` : localEntity,
        requires,
        unknown: !recordId,
      }
    }
    case 'createRoutine':
      addWorkoutReferences(args[0])
      return { primary: localEntity, requires, unknown: !localEntity }
    case 'updateRoutine': {
      const routineId = id(args[0])
      addWorkoutReferences(args[1])
      return {
        primary: routineId ? `routines:${routineId}` : localEntity,
        requires,
        unknown: !routineId,
      }
    }
    case 'deleteRoutine': {
      const routineId = id(args[0])
      return {
        primary: routineId ? `routines:${routineId}` : localEntity,
        requires,
        unknown: !routineId,
      }
    }
    default:
      addWorkoutReferences(payload)
      return { primary: localEntity, requires, unknown: true }
  }
}

function isBlockedBy(dependencies: JobDependencies, earlier: readonly JobDependencies[]): boolean {
  if (earlier.length === 0) return false
  if (dependencies.unknown) return true
  return earlier.some(
    (blocker) =>
      blocker.unknown ||
      (!!blocker.primary &&
        (blocker.primary === dependencies.primary || dependencies.requires.has(blocker.primary))) ||
      (!!dependencies.primary && blocker.requires.has(dependencies.primary))
  )
}

// ---------------------------------------------------------------------------
// SyncEngine
// ---------------------------------------------------------------------------

export class SyncEngine {
  private db: SQLiteDatabase | null = null
  private dbScope: ProfileScope | null = null
  private lifecycleGeneration = 0
  private initialized = false
  private connectivityManaged = false
  private uploadsEnabled = true
  private authenticationPaused = false
  private enableAfterInit = false
  private paused = false
  private resumeAfterDrain = false
  private drainPromise: Promise<void> | null = null
  private appStateSubscription: { remove(): void } | null = null
  private networkStateSubscription: { remove(): void } | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private drainRequested = false
  private queueMutationRevision = 0
  // ponytail: one SQLite write lock; split per table only if contention appears.
  private idRemapLock: Promise<void> = Promise.resolve()
  private remappedIds = new Map<string, string>()
  private idRemapListeners = new Set<IdRemapListener>()
  private listeners: Record<SyncEvent, Set<() => void>> = {
    'sync:start': new Set(),
    'sync:complete': new Set(),
    'sync:error': new Set(),
    'sync:idle': new Set(),
    'sync:change': new Set(),
  }

  constructor(
    private readonly deps: SyncEngineDeps = {
      api: syncApi,
      getNetworkState: () => Network.getNetworkStateAsync(),
      addAppStateListener: (handler) => AppState.addEventListener('change', handler),
      addNetworkStateListener: (handler) => Network.addNetworkStateListener(handler),
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
    this.clearRetryTimer()
    this.appStateSubscription?.remove()
    this.appStateSubscription = null
    this.networkStateSubscription?.remove()
    this.networkStateSubscription = null
    this.drainRequested = false
    this.initialized = false
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
    this.authenticationPaused = false

    // A stopped processor must settle before abandoned jobs become eligible again.
    await this.drainPromise?.catch(() => {})
    if (lifecycleGeneration !== this.lifecycleGeneration || !this.isCurrentEngine(db, scope)) return
    await this.writeQueue(
      db,
      scope,
      'UPDATE sync_queue SET status = ? WHERE status = ?',
      'pending',
      'processing'
    )
    if (lifecycleGeneration !== this.lifecycleGeneration || !this.isCurrentEngine(db, scope)) return

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

    this.authenticationPaused = !!(await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM sync_queue WHERE status = ? LIMIT 1',
      'auth_required'
    ))
    if (lifecycleGeneration !== this.lifecycleGeneration || !this.isCurrentEngine(db, scope)) return

    // Listen for app resume and network recovery so queued work can resume.
    this.initialized = true
    this.appStateSubscription = this.deps.addAppStateListener(this.handleAppStateChange)
    this.networkStateSubscription =
      this.deps.addNetworkStateListener?.((networkState) => {
        if (lifecycleGeneration !== this.lifecycleGeneration || !this.initialized) return
        if (this.connectivityManaged) return
        if (networkState.isConnected === false || networkState.isInternetReachable === false) return
        this.processQueueInBackground()
      }) ?? null
    // Drain any jobs left over from a previous session
    const confirmedUploads = this.enableAfterInit
    this.enableAfterInit = false
    if (confirmedUploads && this.authenticationPaused) {
      await this.resumeAuthentication(db, scope)
    }
    if (options.processOnInit !== false || confirmedUploads) {
      this.processQueueInBackground()
    }
  }

  setUploadsEnabled(enabled: boolean): void {
    this.uploadsEnabled = enabled
    if (!enabled) {
      this.clearRetryTimer()
      this.enableAfterInit = false
      this.resumeAfterDrain = false
      return
    }
    if (this.authenticationPaused) {
      if (this.initialized) this.resumeAuthenticationInBackground()
      else this.enableAfterInit = true
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

  setConnectivityManaged(managed: boolean): void {
    this.connectivityManaged = managed
  }

  async pauseAndDrain(): Promise<void> {
    this.paused = true
    this.resumeAfterDrain = false
    this.uploadsEnabled = false
    this.clearRetryTimer()
    this.enableAfterInit = false
    if (this.drainPromise) await this.drainPromise
  }

  destroy(): void {
    this.lifecycleGeneration += 1
    this.clearRetryTimer()
    this.appStateSubscription?.remove()
    this.appStateSubscription = null
    this.networkStateSubscription?.remove()
    this.networkStateSubscription = null
    this.drainRequested = false
    this.initialized = false
    this.enableAfterInit = false
    this.db = null
    this.dbScope = null
    this.authenticationPaused = false
  }

  private isCurrentEngine(db: SQLiteDatabase, scope: ProfileScope): boolean {
    return (
      this.db === db &&
      this.dbScope === scope &&
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

  scheduleQueueProcessing(): void {
    this.processQueueInBackground()
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

  getQueueMutationRevision(): number {
    return this.queueMutationRevision
  }

  get authPaused(): boolean {
    return this.authenticationPaused
  }

  async listJobs(): Promise<SyncJob[]> {
    const db = this.db
    const scope = this.dbScope
    if (!db || !scope || !this.isCurrentEngine(db, scope)) return []

    const jobs = await this.readQueue(db, scope)
    if (!this.isCurrentEngine(db, scope)) return []
    const blockers: JobDependencies[] = []
    const visible: SyncJob[] = []
    for (const job of jobs) {
      const dependencies = getJobDependencies(job)
      const blocked = isBlockedBy(dependencies, blockers)
      if (job.status !== 'discarded') {
        visible.push(blocked ? { ...job, blocked_reason: BLOCKED_REASON } : job)
      }
      blockers.push(job.status === 'discarded' ? { ...dependencies, unknown: false } : dependencies)
    }
    return visible
  }

  async retryJob(jobId: string): Promise<void> {
    const db = this.db
    const scope = this.dbScope
    if (!db || !scope || !this.isCurrentEngine(db, scope)) {
      throw new Error('Sync queue is not available for this profile.')
    }

    await this.withIdRemapLock(async () => {
      if (!this.isCurrentEngine(db, scope)) throw new Error('Sync profile changed.')
      const job = await db.getFirstAsync<SyncJob>('SELECT * FROM sync_queue WHERE id = ?', jobId)
      if (!this.isCurrentEngine(db, scope)) throw new Error('Sync profile changed.')
      if (!job) throw new Error('Sync job no longer exists.')
      if (!['dead_letter', 'discarded', 'failed'].includes(job.status)) {
        throw new Error(`Sync job cannot be retried while ${job.status}.`)
      }
      await db.runAsync(
        'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ?, next_attempt_at = ? WHERE id = ?',
        'pending',
        0,
        null,
        0,
        jobId
      )
    })
    if (!this.isCurrentEngine(db, scope)) throw new Error('Sync profile changed.')
    this.queueDidChange()
    this.clearRetryTimer()
    this.processQueueInBackground()
  }

  async discardJob(jobId: string): Promise<void> {
    const db = this.db
    const scope = this.dbScope
    if (!db || !scope || !this.isCurrentEngine(db, scope)) {
      throw new Error('Sync queue is not available for this profile.')
    }

    await this.withIdRemapLock(async () => {
      if (!this.isCurrentEngine(db, scope)) throw new Error('Sync profile changed.')
      const job = await db.getFirstAsync<SyncJob>('SELECT * FROM sync_queue WHERE id = ?', jobId)
      if (!this.isCurrentEngine(db, scope)) throw new Error('Sync profile changed.')
      if (!job) throw new Error('Sync job no longer exists.')
      if (job.status === 'processing') throw new Error('A processing sync job cannot be discarded.')
      await db.runAsync('UPDATE sync_queue SET status = ? WHERE id = ?', 'discarded', jobId)
    })
    if (!this.isCurrentEngine(db, scope)) throw new Error('Sync profile changed.')
    this.queueDidChange()
    this.clearRetryTimer()
    this.processQueueInBackground()
  }

  private emit(event: SyncEvent): void {
    this.listeners[event].forEach((cb) => {
      try {
        cb()
      } catch (error) {
        console.error(`[SyncEngine] ${event} listener failed:`, error)
      }
    })
  }

  // -----------------------------------------------------------------------
  // Enqueue
  // -----------------------------------------------------------------------

  /**
   * Insert a sync job and process it unless the caller will kick after commit.
   */
  async enqueue(
    job: SyncJobConfig,
    db: SQLiteDatabase | null = this.db,
    options: EnqueueOptions = {}
  ): Promise<void> {
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
    this.queueDidChange()

    // Fire-and-forget — errors are handled internally
    if (options.processAfterInsert !== false && scope && this.isCurrentEngine(db, scope)) {
      this.processQueueInBackground()
    }
  }

  // -----------------------------------------------------------------------
  // Queue Processing
  // -----------------------------------------------------------------------

  async processQueue(): Promise<void> {
    if (this.drainPromise) {
      this.drainRequested = true
      return this.drainPromise
    }
    if (this.retryTimer) return
    const db = this.db
    const scope = this.dbScope
    if (
      !db ||
      !scope ||
      !this.initialized ||
      !this.uploadsEnabled ||
      this.authenticationPaused ||
      this.paused ||
      !this.isCurrentEngine(db, scope)
    ) {
      return
    }

    // Acquire the guard before even a synchronously resolving network probe can run.
    const drain = Promise.resolve().then(() => this.drainQueue(db, scope))
    this.drainPromise = drain
    const finish = () => {
      if (this.drainPromise !== drain) return
      this.drainPromise = null
      const shouldResume = this.resumeAfterDrain
      const shouldDrainAgain = this.drainRequested
      this.drainRequested = false
      if (this.resumeAfterDrain) {
        this.resumeAfterDrain = false
        this.paused = false
      }
      const activeScope = this.dbScope
      if (
        (shouldResume ||
          !this.isCurrentEngine(db, scope) ||
          (shouldDrainAgain && !this.retryTimer)) &&
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
    if (
      !this.isCurrentEngine(db, scope) ||
      !this.uploadsEnabled ||
      this.authenticationPaused ||
      this.paused
    )
      return
    // Network check
    try {
      const networkState = await new Promise<
        Awaited<ReturnType<SyncEngineDeps['getNetworkState']>>
      >((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Network preflight timed out')),
          NETWORK_PREFLIGHT_TIMEOUT_MS
        )
        this.deps.getNetworkState().then(
          (state) => {
            clearTimeout(timeout)
            resolve(state)
          },
          (error) => {
            clearTimeout(timeout)
            reject(error)
          }
        )
      })
      if (networkState.isConnected === false || networkState.isInternetReachable === false) return
    } catch {
      // Unknown connectivity gets one API probe; a failed request schedules the next attempt.
    }

    if (
      !this.isCurrentEngine(db, scope) ||
      !this.uploadsEnabled ||
      this.authenticationPaused ||
      this.paused
    )
      return

    this.emit('sync:start')

    try {
      let processed = 0
      while (
        processed < QUEUE_BATCH_SIZE &&
        this.isCurrentEngine(db, scope) &&
        this.uploadsEnabled &&
        !this.authenticationPaused &&
        !this.paused
      ) {
        const next = await this.findNextRunnableJob(db, scope)
        if (!next.job) {
          if (next.retryAt !== null) this.scheduleRetry(next.retryAt)
          if (processed === 0) this.emit('sync:idle')
          break
        }

        const success = await this.processJob(next.job, db, scope)
        processed += 1
        if (!success) break
      }

      if (processed === QUEUE_BATCH_SIZE) this.drainRequested = true

      if (this.isCurrentEngine(db, scope)) this.emit('sync:complete')
    } catch (error) {
      console.error('[SyncEngine] processQueue error:', error)
      if (this.isCurrentEngine(db, scope)) this.emit('sync:error')
      throw error
    }
  }

  private async findNextRunnableJob(
    db: SQLiteDatabase,
    scope: ProfileScope
  ): Promise<{ job: SyncJob | null; retryAt: number | null }> {
    const blockers: JobDependencies[] = []
    let afterSequence = 0

    while (this.isCurrentEngine(db, scope)) {
      const jobs = await db.getAllAsync<SyncJob>(
        `SELECT * FROM sync_queue
         WHERE sequence > ?
         ORDER BY sequence ASC LIMIT ${QUEUE_BATCH_SIZE}`,
        afterSequence
      )
      if (!this.isCurrentEngine(db, scope)) return { job: null, retryAt: null }
      if (jobs.length === 0) return { job: null, retryAt: null }

      for (const job of jobs) {
        afterSequence = job.sequence
        const dependencies = getJobDependencies(job)
        const blocked = isBlockedBy(dependencies, blockers)
        const canRun = job.status === 'pending' || job.status === 'failed'

        if (canRun && !blocked) {
          if (job.next_attempt_at <= Date.now()) return { job, retryAt: null }
          return { job: null, retryAt: job.next_attempt_at }
        }
        blockers.push(
          job.status === 'discarded' ? { ...dependencies, unknown: false } : dependencies
        )
      }

      if (jobs.length < QUEUE_BATCH_SIZE) return { job: null, retryAt: null }
    }

    return { job: null, retryAt: null }
  }

  private async readQueue(db: SQLiteDatabase, scope: ProfileScope): Promise<SyncJob[]> {
    const rows: SyncJob[] = []
    let afterSequence = 0
    while (this.isCurrentEngine(db, scope)) {
      const page = await db.getAllAsync<SyncJob>(
        `SELECT * FROM sync_queue
         WHERE sequence > ?
         ORDER BY sequence ASC LIMIT ${QUEUE_BATCH_SIZE}`,
        afterSequence
      )
      if (!this.isCurrentEngine(db, scope) || page.length === 0) break
      rows.push(...page)
      afterSequence = page[page.length - 1].sequence
      if (page.length < QUEUE_BATCH_SIZE) break
    }
    return this.isCurrentEngine(db, scope) ? rows : []
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
    let currentJob: SyncJob | null = null
    await this.withIdRemapLock(async () => {
      if (!this.isCurrentEngine(db, scope)) return
      const latest = await db.getFirstAsync<SyncJob>(
        'SELECT * FROM sync_queue WHERE id = ?',
        job.id
      )
      if (!this.isCurrentEngine(db, scope) || !latest) return
      if (latest.status !== 'pending' && latest.status !== 'failed') return
      if (!this.uploadsEnabled || this.authenticationPaused || this.paused) return
      const requestPayload = latest.request_payload ?? latest.payload
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'UPDATE sync_queue SET status = ?, request_payload = ? WHERE id = ?',
          'processing',
          requestPayload,
          latest.id
        )
      })
      currentJob = { ...latest, status: 'processing', request_payload: requestPayload }
    })
    if (!currentJob || !this.isCurrentEngine(db, scope)) return false
    this.queueDidChange()

    const methodName = currentJob.endpoint as keyof SyncApi
    const apiFunc = this.deps.api[methodName] as (...args: any[]) => Promise<any>

    if (typeof apiFunc !== 'function') {
      console.error(`[SyncEngine] Unknown API method: ${currentJob.endpoint}`)
      await this.markDeadLetter(db, scope, currentJob, `Unknown API method: ${currentJob.endpoint}`)
      return true
    }

    let args: any[]
    try {
      const parsedPayload = JSON.parse(currentJob.request_payload ?? currentJob.payload)
      args = Array.isArray(parsedPayload) ? parsedPayload : [parsedPayload]
    } catch (error) {
      await this.markDeadLetter(
        db,
        scope,
        currentJob,
        `Invalid queued payload: ${(error as Error)?.message || 'Invalid JSON'}`
      )
      return true
    }

    if (!this.isCurrentEngine(db, scope)) {
      return false
    }

    let response: any
    try {
      response = await apiFunc.apply(this.deps.api, [
        ...args,
        currentJob.idempotency_key ?? currentJob.id,
      ])
    } catch (error) {
      const isDelete =
        currentJob.endpoint === 'deleteWorkout' ||
        currentJob.endpoint === 'deleteWorkoutRecord' ||
        currentJob.endpoint === 'deleteRoutine'
      if (!isDelete || (error as { status?: number })?.status !== 404) {
        return this.handleJobError(db, scope, currentJob, error)
      }
    }

    if (!this.isCurrentEngine(db, scope)) {
      return false
    }

    const remap =
      response?.workoutRecord?.id &&
      currentJob.local_table === 'workout_records' &&
      currentJob.local_id
        ? {
            tableName: 'workout_records',
            oldId: currentJob.local_id,
            newId: response.workoutRecord.id as string,
          }
        : response?.id && currentJob.local_table && currentJob.local_id
          ? {
              tableName: currentJob.local_table,
              oldId: currentJob.local_id,
              newId: response.id as string,
            }
          : null

    await this.withIdRemapLock(async () => {
      if (!this.isCurrentEngine(db, scope)) return
      await db.withTransactionAsync(async () => {
        if (!this.isCurrentEngine(db, scope))
          throw new Error('Sync lifecycle changed during acknowledgement')
        if (remap) {
          await this.applyIdRemap(
            db,
            scope,
            remap.tableName,
            remap.oldId,
            remap.newId,
            currentJob.id
          )
        }
        if (
          currentJob.endpoint === 'recordWorkout' &&
          currentJob.local_id &&
          response?.workoutRecord?.workoutTitle &&
          response.workoutRecord.createdAt &&
          Array.isArray(response.workoutRecord.exerciseRecords)
        ) {
          const record = response.workoutRecord as WorkoutRecord
          await db.runAsync(
            `UPDATE workout_records
             SET workout_id = ?, workout_title = ?, notes = ?, created_at = ?, start_time = ?, exercise_records = ?
             WHERE id = ?`,
            record.workoutId,
            record.workoutTitle,
            record.notes ?? null,
            record.createdAt,
            record.startTime ?? null,
            JSON.stringify(record.exerciseRecords),
            remap?.newId ?? currentJob.local_id
          )
        }
        const deletedTable =
          currentJob.endpoint === 'deleteWorkout'
            ? 'workouts'
            : currentJob.endpoint === 'deleteWorkoutRecord'
              ? 'workout_records'
              : currentJob.endpoint === 'deleteRoutine'
                ? 'routines'
                : null
        if (deletedTable) {
          await db.runAsync(
            `DELETE FROM "${deletedTable}" WHERE id = ? AND is_deleted = 1`,
            args[0]
          )
        }
        await db.runAsync('DELETE FROM sync_queue WHERE id = ?', currentJob.id)
      })
      if (!this.isCurrentEngine(db, scope)) return
      if (remap) {
        if (remap.oldId !== remap.newId) {
          this.remappedIds.set(`${remap.tableName}:${remap.oldId}`, remap.newId)
        }
        this.emitIdRemap(remap.tableName, remap.oldId, remap.newId)
        console.log(`[SyncEngine] Remapped ${remap.tableName}: ${remap.oldId} → ${remap.newId}`)
      }
      this.queueDidChange()
    })
    console.log(`[SyncEngine] ✓ ${currentJob.endpoint}`)
    return true
  }

  // -----------------------------------------------------------------------
  // ID Remapping (safe)
  // -----------------------------------------------------------------------

  private async applyIdRemap(
    db: SQLiteDatabase,
    scope: ProfileScope,
    tableName: string,
    oldId: string,
    newId: string,
    sourceJobId?: string
  ): Promise<void> {
    // Allowlist check (defense-in-depth; already validated at enqueue)
    if (!(ALLOWED_TABLES as readonly string[]).includes(tableName)) {
      throw new Error(`Invalid remap table: ${tableName}`)
    }

    if (!this.isCurrentEngine(db, scope))
      throw new Error('Sync lifecycle changed during ID remap')
    const serverRowAlreadyHydrated =
      oldId !== newId &&
      (await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM "${tableName}" WHERE id = ?`,
        newId
      ))

    if (!this.isCurrentEngine(db, scope))
      throw new Error('Sync lifecycle changed during ID remap')
    if (serverRowAlreadyHydrated) {
      // Hydration can insert the server row before this create job returns.
      const oldRow = await db.getFirstAsync<{ is_deleted: number }>(
        `SELECT is_deleted FROM "${tableName}" WHERE id = ?`,
        oldId
      )
      if (tableName === 'workouts') {
        await db.runAsync(
          'UPDATE workout_records SET workout_id = ? WHERE workout_id = ?',
          newId,
          oldId
        )
      }
      if (oldRow?.is_deleted) {
        await db.runAsync(`UPDATE "${tableName}" SET is_deleted = 1 WHERE id = ?`, newId)
      }
      if (!this.isCurrentEngine(db, scope))
        throw new Error('Sync lifecycle changed during ID remap')
      await db.runAsync(`DELETE FROM "${tableName}" WHERE id = ?`, oldId)
    } else {
      // Use a safe, compile-time known query for each table
      const query = `UPDATE "${tableName}" SET id = ? WHERE id = ?`
      await db.runAsync(query, newId, oldId)
    }

    if (!this.isCurrentEngine(db, scope))
      throw new Error('Sync lifecycle changed during ID remap')
    if (tableName === 'workouts') {
      await this.remapJsonReferences(db, scope, 'workouts', 'workout_template', oldId, newId)
      await this.remapJsonReferences(db, scope, 'routines', 'pattern', oldId, newId)
    }

    // Mark as synced
    if (!this.isCurrentEngine(db, scope))
      throw new Error('Sync lifecycle changed during ID remap')
    await db.runAsync(
      `UPDATE "${tableName}" SET is_synced = 1, synced_at = ? WHERE id = ?`,
      new Date().toISOString(),
      newId
    )

    await this.rewriteQueuedPayloadReferences(db, scope, oldId, newId, sourceJobId)
    if (!this.isCurrentEngine(db, scope))
      throw new Error('Sync lifecycle changed during ID remap')
    if (oldId !== newId) {
      await db.runAsync(
        'INSERT OR REPLACE INTO id_remaps (table_name, old_id, new_id) VALUES (?, ?, ?)',
        tableName,
        oldId,
        newId
      )
    }
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
       WHERE request_payload IS NULL
         AND id != ?`,
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
      return false
    }

    const newRetryCount = job.retry_count + 1
    const errorMsg = error?.message || 'Unknown error'
    const statusCode = error?.status as number | undefined

    if (
      error?.code === 'MANUAL_OFFLINE' ||
      error?.code === 'NETWORK_POLICY_CHANGED' ||
      error?.code === 'NETWORK_PREFERENCE_ERROR'
    ) {
      await this.resetPending(db, scope, job.id)
      return false
    }

    if (statusCode === 401 || error?.code === 'AUTH_SESSION_CHANGED') {
      await this.writeQueue(
        db,
        scope,
        'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ?, next_attempt_at = ? WHERE id = ?',
        'auth_required',
        newRetryCount,
        errorMsg,
        0,
        job.id
      )
      if (this.isCurrentEngine(db, scope)) {
        this.authenticationPaused = true
        this.clearRetryTimer()
        this.emit('sync:error')
      }
      return false
    }

    // Permanent failures (4xx except 408, 429) — dead-letter immediately
    if (
      statusCode &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 429
    ) {
      console.error(`[SyncEngine] Permanent failure [${job.endpoint}]: ${statusCode} ${errorMsg}`)
      await this.markDeadLetter(db, scope, job, `${statusCode}: ${errorMsg}`)
      return true
    }

    console.warn(
      `[SyncEngine] Retryable failure [${job.endpoint}] attempt ${newRetryCount}: ${errorMsg}`
    )
    const nextAttemptAt = Date.now() + this.getBackoff(newRetryCount)
    await this.writeQueue(
      db,
      scope,
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ?, next_attempt_at = ? WHERE id = ?',
      'failed',
      newRetryCount,
      errorMsg,
      nextAttemptAt,
      job.id
    )
    if (this.uploadsEnabled && !this.paused && this.isCurrentEngine(db, scope)) {
      this.scheduleRetry(nextAttemptAt)
    }

    // Stop processing to preserve ordering; the timer or connectivity listener restarts the drain.
    return false
  }

  private async markDeadLetter(
    db: SQLiteDatabase,
    scope: ProfileScope,
    job: SyncJob,
    errorMsg: string
  ): Promise<void> {
    await this.writeQueue(
      db,
      scope,
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?',
      'dead_letter',
      job.retry_count + 1,
      errorMsg,
      job.id
    )
  }

  private async resetPending(
    db: SQLiteDatabase,
    scope: ProfileScope,
    jobId: string
  ): Promise<void> {
    await this.writeQueue(
      db,
      scope,
      'UPDATE sync_queue SET status = ? WHERE id = ?',
      'pending',
      jobId
    )
  }

  private async writeQueue(
    db: SQLiteDatabase,
    scope: ProfileScope,
    sql: string,
    ...params: any[]
  ): Promise<void> {
    let changed = false
    await this.withIdRemapLock(async () => {
      if (this.isCurrentEngine(db, scope)) {
        await db.runAsync(sql, ...params)
        changed = true
      }
    })
    if (changed && this.isCurrentEngine(db, scope)) this.queueDidChange()
  }

  private queueDidChange(): void {
    this.queueMutationRevision += 1
    this.emit('sync:change')
  }

  private resumeAuthenticationInBackground(): void {
    const db = this.db
    const scope = this.dbScope
    if (!db || !scope) return
    void this.resumeAuthentication(db, scope)
      .then(() => this.processQueue())
      .catch((error) => console.error('[SyncEngine] Failed to resume authenticated sync:', error))
  }

  private async resumeAuthentication(db: SQLiteDatabase, scope: ProfileScope): Promise<void> {
    let changed = false
    await this.withIdRemapLock(async () => {
      if (!this.isCurrentEngine(db, scope) || !this.uploadsEnabled) return
      await db.runAsync(
        'UPDATE sync_queue SET status = ?, error_message = ?, next_attempt_at = ? WHERE status = ?',
        'pending',
        null,
        0,
        'auth_required'
      )
      changed = true
    })
    if (!changed || !this.isCurrentEngine(db, scope) || !this.uploadsEnabled) return
    this.authenticationPaused = false
    if (this.paused) {
      if (this.drainPromise) this.resumeAfterDrain = true
      else this.paused = false
    }
    this.queueDidChange()
  }

  // -----------------------------------------------------------------------
  // Exponential Backoff
  // -----------------------------------------------------------------------

  private getBackoff(retryCount: number): number {
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.min(retryCount, 6), MAX_BACKOFF_MS)
    const jitter = Math.random() * backoff * 0.3
    return Math.ceil(Math.min(backoff + jitter, MAX_BACKOFF_MS))
  }

  private scheduleRetry(nextAttemptAt: number): void {
    this.clearRetryTimer()
    const lifecycleGeneration = this.lifecycleGeneration
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null
        if (lifecycleGeneration !== this.lifecycleGeneration || !this.initialized) return
        this.processQueueInBackground()
      },
      Math.max(0, nextAttemptAt - Date.now())
    )
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  // -----------------------------------------------------------------------
  // App State
  // -----------------------------------------------------------------------

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === 'active' && !this.connectivityManaged) {
      this.processQueueInBackground()
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const syncEngine = new SyncEngine()
