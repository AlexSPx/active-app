const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const hash = (value) => createHash('sha256').update(value).digest('hex')
const root = path.resolve(__dirname, '../..')

test('review archive verifies pinned manifest and every output', async () => {
  const { verifyReviewArchive } = await import('../../features/coach/knowledge/validate-data.mjs')
  const output = 'synthetic review output'
  const manifest = JSON.stringify({ outputs: { 'rows.jsonl': hash(output) } })
  const files = { 'manifest.json': manifest, 'rows.jsonl': output }
  const read = (name) => {
    if (!(name in files)) throw Error(`Missing ${name}`)
    return files[name]
  }
  assert.deepEqual(verifyReviewArchive(read, hash(manifest)).errors, [])
  files['rows.jsonl'] = 'tampered'
  assert.deepEqual(verifyReviewArchive(read, hash(manifest)).errors, ['Review file changed: rows.jsonl'])
  delete files['rows.jsonl']
  assert.throws(() => verifyReviewArchive(read, hash(manifest)), /Missing rows/)
  files['rows.jsonl'] = output
  files['manifest.json'] = JSON.stringify({ outputs: { 'rows.jsonl': hash(output), other: hash('x') } })
  files.other = 'x'
  assert.deepEqual(verifyReviewArchive(read, hash(manifest)).errors, ['Untrusted review manifest'])
})

test('development and release gates fail closed without evidence', () => {
  const run = (purpose) => spawnSync(process.execPath, ['scripts/coach/gate.mjs', purpose], {
    cwd: root, encoding: 'utf8', env: { ...process.env, COACH_EVIDENCE_ROOT: path.join(root, 'missing-evidence') },
  })
  assert.notEqual(run('development').status, 0)
  assert.notEqual(run('release').status, 0)
})


test('Expo config requires review evidence even when the coach is disabled', () => {
  const config = (flags) => spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--json'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, EXPO_PUBLIC_COACH_DEV: '', EXPO_PUBLIC_COACH_PROMOTE: '', COACH_EVIDENCE_ROOT: path.join(root, 'missing-evidence'), ...flags },
  })
  assert.notEqual(config({}).status, 0)
  assert.notEqual(config({ EXPO_PUBLIC_COACH_DEV: '1' }).status, 0)
  assert.notEqual(config({ EXPO_PUBLIC_COACH_PROMOTE: '1' }).status, 0)
})
