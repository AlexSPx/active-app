import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { Directory, File, FileMode, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import type { CoachModelManifest } from './modelManifest'
import type { VerifiedCoachArtifact } from './types'

const directory = new Directory(Paths.document, 'coach-models')
const active = new Set<string>()

function verificationProof(file: File, model: CoachModelManifest): string | null {
  if (!file.exists) return null
  const size = file.size
  const modified = file.modificationTime
  const created = file.creationTime
  return file.exists && size === model.byteSize && modified != null && created != null
    ? JSON.stringify({ size, modified, created, sha256: model.sha256 })
    : null
}

function verificationReceipt(model: CoachModelManifest): File {
  return new File(directory, `${model.sha256}.verified`)
}

function matchesReceipt(receipt: File, proof: string): boolean {
  try {
    return receipt.exists && receipt.textSync() === proof
  } catch {
    return false
  }
}

function saveReceipt(receipt: File, proof: string): void {
  try {
    receipt.writeSync(proof)
  } catch {
    // Verification still succeeded. A later startup can hash the file again.
  }
}

function promote(
  partial: File,
  target: File,
  model: CoachModelManifest,
  receipt: File,
  proof: string | null
): void {
  partial.rename(`${model.sha256}.gguf`)
  if (proof && verificationProof(target, model) === proof) saveReceipt(receipt, proof)
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
  onProgress?: (bytes: number, total: number) => void,
  receipt?: File
): Promise<{ proof: string | null } | null> {
  if (signal?.aborted) throw new Error('cancelled')
  if (!file.exists || file.size !== model.byteSize) return null
  const before = verificationProof(file, model)
  if (receipt && before && matchesReceipt(receipt, before)) {
    onProgress?.(model.byteSize, model.byteSize)
    return { proof: before }
  }
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
        if (!bytes.length) return null
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
  const after = verificationProof(file, model)
  if (!file.exists || file.size !== model.byteSize || digest !== model.sha256) return null
  if (before && after && before !== after) return null
  const proof = before ? after : null
  if (receipt && proof) saveReceipt(receipt, proof)
  onProgress?.(model.byteSize, model.byteSize)
  return { proof }
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
    const receipt = verificationReceipt(model)
    if (!(await verify(file, model, signal, onProgress, receipt))) {
      if (receipt.exists) receipt.delete()
      const partial = new File(directory, `${model.sha256}.partial`)
      const checked = await verify(partial, model, signal, onProgress)
      if (checked) {
        if (Platform.OS === 'android' && Number(Platform.Version) < 26)
          return {
            kind: 'failure',
            code: 'unavailable',
            message: 'Android 8 or newer is required for model promotion.',
          }
        if (signal?.aborted) throw new Error('cancelled')
        if (file.exists) file.delete()
        promote(partial, file, model, receipt, checked.proof)
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
  const receipt = verificationReceipt(model)
  let preservePartial = partial.exists && partial.size === model.byteSize
  let step = 'prepare model storage'
  try {
    if (options.signal?.aborted)
      return { kind: 'failure', code: 'cancelled', message: 'Download cancelled.' }
    directory.create({ intermediates: true, idempotent: true })
    const onVerify = (bytes: number, total: number) => options.onProgress?.('verify', bytes, total)
    if (await verify(target, model, options.signal, onVerify, receipt)) {
      if (options.signal?.aborted)
        return { kind: 'failure', code: 'cancelled', message: 'Download cancelled.' }
      return { kind: 'ready', artifact: artifact(target, model) }
    }
    if (receipt.exists) receipt.delete()
    if (target.exists) target.delete()
    if (partial.exists && partial.size === model.byteSize) {
      preservePartial = true
      const checked = await verify(partial, model, options.signal, onVerify)
      if (checked) {
        if (options.signal?.aborted) throw new Error('cancelled')
        promote(partial, target, model, receipt, checked.proof)
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
    const checked = await verify(partial, model, options.signal, onVerify)
    if (!checked) {
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
    promote(partial, target, model, receipt, checked.proof)
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
  const receipt = verificationReceipt(model)
  if (receipt.exists) receipt.delete()
  if (file.exists) file.delete()
  const partial = new File(directory, `${model.sha256}.partial`)
  if (partial.exists) partial.delete()
}
