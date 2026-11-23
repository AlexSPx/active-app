import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { Directory, File, FileMode, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import type { CoachModelManifest } from './modelManifest'
import type { VerifiedCoachArtifact } from './types'

const directory = new Directory(Paths.document, 'coach-models')
const active = new Set<string>()
const verified = new Map<
  string,
  { sha256: string; size: number; modified: number; created: number }
>()

function metadata(file: File) {
  if (!file.exists) return null
  const size = file.size
  const modified = file.modificationTime
  const created = file.creationTime
  return file.exists && size != null && modified != null && created != null
    ? { size, modified, created }
    : null
}

function sameMetadata(a: ReturnType<typeof metadata>, b: ReturnType<typeof metadata>): boolean {
  return !!a && !!b && a.size === b.size && a.modified === b.modified && a.created === b.created
}

function promote(partial: File, target: File, model: CoachModelManifest): void {
  const before = metadata(partial)
  const cached = verified.get(partial.uri)
  verified.delete(target.uri)
  verified.delete(partial.uri)
  partial.rename(`${model.sha256}.gguf`)
  const after = metadata(target)
  if (
    cached &&
    cached.sha256 === model.sha256 &&
    sameMetadata(cached, before) &&
    sameMetadata(before, after) &&
    after
  )
    verified.set(target.uri, { ...after, sha256: model.sha256 })
}

function validManifest(model: CoachModelManifest): boolean {
  return (
    /^[a-f0-9]{64}$/.test(model.sha256) &&
    Number.isSafeInteger(model.byteSize) &&
    model.byteSize > 0 &&
    model.url.startsWith('https://')
  )
}

export type ModelFileResult =
  | { kind: 'ready'; artifact: VerifiedCoachArtifact }
  | {
      kind: 'failure'
      code: 'cancelled' | 'insufficient_space' | 'invalid_artifact' | 'io_error' | 'unavailable'
      message: string
    }

async function verify(
  file: File,
  model: CoachModelManifest,
  signal?: AbortSignal,
  onProgress?: (bytes: number, total: number) => void
): Promise<boolean> {
  if (signal?.aborted) throw new Error('cancelled')
  const before = metadata(file)
  if (!file.exists || file.size !== model.byteSize) {
    verified.delete(file.uri)
    return false
  }
  const cached = verified.get(file.uri)
  if (cached?.sha256 === model.sha256 && sameMetadata(cached, before)) {
    onProgress?.(model.byteSize, model.byteSize)
    return true
  }
  verified.delete(file.uri)
  onProgress?.(0, model.byteSize)
  let digest: string
  if (typeof file.digest === 'function') {
    digest = await file.digest('SHA-256')
  } else {
    // Older development builds may not yet contain the native digest API.
    const hash = sha256.create()
    const handle = file.open(FileMode.ReadOnly)
    let total = 0
    try {
      while (total < model.byteSize) {
        if (signal?.aborted) throw new Error('cancelled')
        const bytes = await handle.readBytes(Math.min(1024 * 1024, model.byteSize - total))
        if (!bytes.length) return false
        total += bytes.length
        hash.update(bytes)
        onProgress?.(total, model.byteSize)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      handle.close()
    }
    digest = bytesToHex(hash.digest())
  }
  if (signal?.aborted) throw new Error('cancelled')
  const after = metadata(file)
  if (!file.exists || file.size !== model.byteSize || digest !== model.sha256) return false
  if (before && after && !sameMetadata(before, after)) return false
  if (before && after) verified.set(file.uri, { ...after, sha256: model.sha256 })
  onProgress?.(model.byteSize, model.byteSize)
  return true
}

function artifact(file: File, model: CoachModelManifest): VerifiedCoachArtifact {
  return { path: file.uri, sha256: model.sha256, byteSize: model.byteSize, verified: true }
}

export async function getVerifiedModel(
  model: CoachModelManifest,
  signal?: AbortSignal,
  onProgress?: (bytes: number, total: number) => void
): Promise<ModelFileResult> {
  if (!validManifest(model))
    return { kind: 'failure', code: 'invalid_artifact', message: 'Invalid model manifest.' }
  if (active.has(model.sha256))
    return {
      kind: 'failure',
      code: 'io_error',
      message: 'Model preparation is already in progress.',
    }
  active.add(model.sha256)
  try {
    if (signal?.aborted)
      return { kind: 'failure', code: 'cancelled', message: 'Verification cancelled.' }
    const file = new File(directory, `${model.sha256}.gguf`)
    if (!(await verify(file, model, signal, onProgress))) {
      const partial = new File(directory, `${model.sha256}.partial`)
      if (await verify(partial, model, signal, onProgress)) {
        if (Platform.OS === 'android' && Number(Platform.Version) < 26)
          return {
            kind: 'failure',
            code: 'unavailable',
            message: 'Android 8 or newer is required for model promotion.',
          }
        if (signal?.aborted) throw new Error('cancelled')
        if (file.exists) file.delete()
        promote(partial, file, model)
        return { kind: 'ready', artifact: artifact(file, model) }
      }
      if (partial.exists) partial.delete()
      return {
        kind: 'failure',
        code: 'invalid_artifact',
        message: 'Model is missing or failed verification.',
      }
    }
    if (signal?.aborted)
      return { kind: 'failure', code: 'cancelled', message: 'Verification cancelled.' }
    return { kind: 'ready', artifact: artifact(file, model) }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      kind: 'failure',
      code: signal?.aborted ? 'cancelled' : 'io_error',
      message: signal?.aborted
        ? 'Verification cancelled.'
        : `Could not verify the model: ${detail}`,
    }
  } finally {
    active.delete(model.sha256)
  }
}

export async function downloadCoachModel(
  model: CoachModelManifest,
  options: {
    signal?: AbortSignal
    onProgress?: (phase: 'download' | 'verify', bytes: number, total: number) => void
  } = {}
): Promise<ModelFileResult> {
  if (Platform.OS === 'android' && Number(Platform.Version) < 26)
    return {
      kind: 'failure',
      code: 'unavailable',
      message: 'Android 8 or newer is required for model promotion.',
    }
  if (!validManifest(model))
    return { kind: 'failure', code: 'invalid_artifact', message: 'Invalid model manifest.' }
  if (active.has(model.sha256))
    return { kind: 'failure', code: 'io_error', message: 'Model download is already in progress.' }
  active.add(model.sha256)
  const partial = new File(directory, `${model.sha256}.partial`)
  const target = new File(directory, `${model.sha256}.gguf`)
  let preservePartial = partial.exists && partial.size === model.byteSize
  let step = 'prepare model storage'
  try {
    if (options.signal?.aborted)
      return { kind: 'failure', code: 'cancelled', message: 'Download cancelled.' }
    directory.create({ intermediates: true, idempotent: true })
    const onVerify = (bytes: number, total: number) => options.onProgress?.('verify', bytes, total)
    if (await verify(target, model, options.signal, onVerify)) {
      if (options.signal?.aborted)
        return { kind: 'failure', code: 'cancelled', message: 'Download cancelled.' }
      return { kind: 'ready', artifact: artifact(target, model) }
    }
    if (target.exists) target.delete()
    if (partial.exists && partial.size === model.byteSize) {
      preservePartial = true
      if (await verify(partial, model, options.signal, onVerify)) {
        if (options.signal?.aborted) throw new Error('cancelled')
        promote(partial, target, model)
        return { kind: 'ready', artifact: artifact(target, model) }
      }
      preservePartial = false
    }
    if (partial.exists) partial.delete()
    // iOS may use a temporary download in addition to the destination.
    // A reserve covers filesystem overhead and temporary download storage.
    if (Paths.availableDiskSpace < model.byteSize * 2 + 256 * 1024 * 1024)
      return {
        kind: 'failure',
        code: 'insufficient_space',
        message: 'Not enough free space for the model.',
      }
    step = 'download the model'
    options.onProgress?.('download', 0, model.byteSize)
    await File.downloadFileAsync(model.url, partial, {
      signal: options.signal,
      onProgress: ({ bytesWritten, totalBytes }) =>
        options.onProgress?.('download', bytesWritten, totalBytes),
    })
    step = 'verify the downloaded model'
    preservePartial = true
    if (!(await verify(partial, model, options.signal, onVerify))) {
      preservePartial = false
      return {
        kind: 'failure',
        code: 'invalid_artifact',
        message: 'Downloaded model failed size or SHA-256 verification.',
      }
    }
    if (options.signal?.aborted)
      return { kind: 'failure', code: 'cancelled', message: 'Download cancelled.' }
    // Same-directory rename avoids the copy fallback in File.move.
    step = 'store the verified model'
    promote(partial, target, model)
    return { kind: 'ready', artifact: artifact(target, model) }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      kind: 'failure',
      code: options.signal?.aborted ? 'cancelled' : 'io_error',
      message: options.signal?.aborted ? 'Download cancelled.' : `Could not ${step}: ${detail}`,
    }
  } finally {
    try {
      if (!preservePartial && partial.exists) partial.delete()
    } finally {
      active.delete(model.sha256)
    }
  }
}

export function deleteCoachModel(model: CoachModelManifest): void {
  if (!validManifest(model)) throw new Error('Invalid model manifest.')
  if (active.has(model.sha256)) throw new Error('Model download is in progress.')
  const file = new File(directory, `${model.sha256}.gguf`)
  verified.delete(file.uri)
  verified.delete(new File(directory, `${model.sha256}.partial`).uri)
  if (file.exists) file.delete()
  const partial = new File(directory, `${model.sha256}.partial`)
  if (partial.exists) partial.delete()
}
