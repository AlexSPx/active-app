const mockFiles = new Map()
let mockMetadataAvailable = true
let mockReadCount = 0
let mockDigestCount = 0
let mockDigest = async (bytes) => require('crypto').createHash('sha256').update(bytes).digest('hex')
const mockTimes = new WeakMap()
let mockNextTime = 1
function mockTime(bytes) {
  if (!mockTimes.has(bytes)) mockTimes.set(bytes, mockNextTime++)
  return mockTimes.get(bytes)
}
let mockSpace = 1024 * 1024 * 1024
let mockDownload = async (_url, destination) => {
  mockFiles.set(destination.uri, Uint8Array.from([97, 98, 99]))
}
jest.mock('expo-file-system', () => {
  class Directory {
    constructor(_base, name) {
      this.uri = `doc/${name}`
    }
    create() {}
  }
  class File {
    constructor(dir, name) {
      this.uri = `${dir.uri}/${name}`
    }
    get exists() {
      return mockFiles.has(this.uri)
    }
    get size() {
      return mockFiles.get(this.uri)?.length || 0
    }
    get modificationTime() {
      const bytes = mockFiles.get(this.uri)
      return bytes && mockMetadataAvailable ? mockTime(bytes) : null
    }
    get creationTime() {
      // Android reads filesystem attributes and throws for a missing path.
      if (!this.exists) throw new Error('No such file')
      return this.modificationTime
    }
    digest(algorithm) {
      expect(algorithm).toBe('SHA-256')
      mockDigestCount++
      return mockDigest(mockFiles.get(this.uri))
    }
    delete() {
      mockFiles.delete(this.uri)
    }
    open() {
      let offset = 0
      return {
        readBytes: async (n) => {
          mockReadCount++
          const bytes = mockFiles.get(this.uri).slice(offset, offset + n)
          offset += bytes.length
          return bytes
        },
        close() {},
      }
    }
    rename(name) {
      const dest = this.uri.slice(0, this.uri.lastIndexOf('/') + 1) + name
      mockFiles.set(dest, mockFiles.get(this.uri))
      mockFiles.delete(this.uri)
      this.uri = dest
    }
    static downloadFileAsync(url, file, options) {
      return mockDownload(url, file, options)
    }
  }
  return {
    Directory,
    File,
    FileMode: { ReadOnly: 'r' },
    Paths: {
      document: {},
      get availableDiskSpace() {
        return mockSpace
      },
    },
  }
})
const {
  downloadCoachModel,
  getVerifiedModel,
  deleteCoachModel,
} = require('../../features/coach/runtime/modelFiles.native')
const model = {
  id: 'test',
  url: 'https://example.com/model',
  byteSize: 3,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
}
beforeEach(() => {
  mockFiles.clear()
  mockMetadataAvailable = true
  mockReadCount = 0
  mockDigestCount = 0
  mockDigest = async (bytes) => require('crypto').createHash('sha256').update(bytes).digest('hex')
  mockSpace = 1024 * 1024 * 1024
  mockDownload = async (_url, file) => {
    mockFiles.set(file.uri, Uint8Array.from([97, 98, 99]))
  }
})

test('downloads, hashes, promotes and re-verifies the exact artifact', async () => {
  const result = await downloadCoachModel(model)
  expect(result).toEqual({
    kind: 'ready',
    artifact: {
      path: `doc/coach-models/${model.sha256}.gguf`,
      sha256: model.sha256,
      byteSize: 3,
      verified: true,
    },
  })
  expect(await getVerifiedModel(model)).toEqual(result)
  expect(mockDigestCount).toBe(1)
  expect(mockReadCount).toBe(0)
  mockFiles.set(result.artifact.path, Uint8Array.from([97, 98, 100]))
  expect((await getVerifiedModel(model)).code).toBe('invalid_artifact')
})

test('cleans a corrupt or interrupted partial and refuses insufficient space', async () => {
  mockDownload = async (_url, file) => {
    mockFiles.set(file.uri, Uint8Array.from([97, 98, 100]))
  }
  expect((await downloadCoachModel(model)).code).toBe('invalid_artifact')
  expect(mockFiles.size).toBe(0)
  mockDownload = async (_url, file) => {
    mockFiles.set(file.uri, Uint8Array.from([97]))
    throw Error('network')
  }
  expect(await downloadCoachModel(model)).toMatchObject({
    kind: 'failure',
    code: 'io_error',
    message: 'Could not download the model: network',
  })
  expect(mockFiles.size).toBe(0)
  mockSpace = 0
  expect((await downloadCoachModel(model)).code).toBe('insufficient_space')
})

test('reports native verification progress and honours cancellation before promotion', async () => {
  const controller = new AbortController()
  const progress = []
  let finishDigest
  mockDigest = () =>
    new Promise((resolve) => {
      finishDigest = resolve
    })
  const pending = downloadCoachModel(model, {
    signal: controller.signal,
    onProgress: (phase, n, total) => progress.push([phase, n, total]),
  })
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort()
  finishDigest(model.sha256)
  expect((await pending).code).toBe('cancelled')
  expect(progress).toContainEqual(['verify', 0, model.byteSize])
  expect(progress).not.toContainEqual(['verify', model.byteSize, model.byteSize])
  expect(mockFiles.has(`doc/coach-models/${model.sha256}.partial`)).toBe(true)
  mockDigest = async (bytes) => require('crypto').createHash('sha256').update(bytes).digest('hex')
  expect((await getVerifiedModel(model)).kind).toBe('ready')
})

test('rejects a file changed during native hashing and does not cache it', async () => {
  const path = `doc/coach-models/${model.sha256}.gguf`
  mockFiles.set(path, Uint8Array.from([97, 98, 99]))
  mockDigest = async () => {
    mockFiles.set(path, Uint8Array.from([97, 98, 100]))
    return model.sha256
  }
  expect((await getVerifiedModel(model)).code).toBe('invalid_artifact')
  mockDigest = async (bytes) => require('crypto').createHash('sha256').update(bytes).digest('hex')
  expect((await getVerifiedModel(model)).code).toBe('invalid_artifact')
  expect(mockDigestCount).toBe(2)
})

test('never promotes a full-size corrupt partial during recovery', async () => {
  mockFiles.set(`doc/coach-models/${model.sha256}.partial`, Uint8Array.from([97, 98, 100]))
  expect((await getVerifiedModel(model)).code).toBe('invalid_artifact')
  expect(mockFiles.size).toBe(0)
})

test('does not cache when timestamps are unavailable', async () => {
  mockMetadataAvailable = false
  mockFiles.set(`doc/coach-models/${model.sha256}.gguf`, Uint8Array.from([97, 98, 99]))
  expect((await getVerifiedModel(model)).kind).toBe('ready')
  expect((await getVerifiedModel(model)).kind).toBe('ready')
  expect(mockDigestCount).toBe(2)
})

test('clears verification on deletion and checks a replacement', async () => {
  await downloadCoachModel(model)
  deleteCoachModel(model)
  mockFiles.set(`doc/coach-models/${model.sha256}.gguf`, Uint8Array.from([97, 98, 100]))
  expect((await getVerifiedModel(model)).code).toBe('invalid_artifact')
  expect(mockDigestCount).toBe(2)
})

test('uses the cancellable JavaScript fallback when native digest is unavailable', async () => {
  const { File } = require('expo-file-system')
  const digest = File.prototype.digest
  File.prototype.digest = undefined
  try {
    mockFiles.set(`doc/coach-models/${model.sha256}.gguf`, Uint8Array.from([97, 98, 99]))
    expect((await getVerifiedModel(model)).kind).toBe('ready')
    expect(mockReadCount).toBe(1)
  } finally {
    File.prototype.digest = digest
  }
})

test('offers download when neither the model nor its partial exists', async () => {
  expect(await getVerifiedModel(model)).toMatchObject({
    kind: 'failure',
    code: 'invalid_artifact',
  })
  expect(mockDigestCount).toBe(0)
})

test('preserves the underlying verification error and keeps the artifact for retry', async () => {
  const path = `doc/coach-models/${model.sha256}.gguf`
  mockFiles.set(path, Uint8Array.from([97, 98, 99]))
  mockDigest = async () => {
    throw new Error('Native digest failed')
  }
  expect(await getVerifiedModel(model)).toMatchObject({
    code: 'io_error',
    message: 'Could not verify the model: Native digest failed',
  })
  expect(mockFiles.has(path)).toBe(true)
})
