const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, appendFileSync } = require('node:fs')
const { tmpdir } = require('node:os')

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


test('disabled Expo config works without evidence; enabled and promoted configurations fail closed', () => {
  const config = (flags) => spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--json'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, EXPO_PUBLIC_COACH_DEV: '', EXPO_PUBLIC_COACH_PROMOTE: '', COACH_EVIDENCE_ROOT: path.join(root, 'missing-evidence'), ...flags },
  })
  const disabled = config({})
  assert.equal(disabled.status, 0, disabled.stderr)
  assert.equal(JSON.parse(disabled.stdout).extra.coachAvailability, 'disabled')
  assert.notEqual(config({ EXPO_PUBLIC_COACH_DEV: '1' }).status, 0)
  assert.notEqual(config({ EXPO_PUBLIC_COACH_PROMOTE: '1' }).status, 0)
})


test('enabled Expo config rejects a tampered review archive', () => {
  const evidence = mkdtempSync(path.join(tmpdir(), 'coach-evidence-'))
  try {
    const review = path.join(evidence, 'evaluation/coach-v1/reviews/knowledge-review-01')
    mkdirSync(review, { recursive: true })
    writeFileSync(path.join(review, 'manifest.json'), JSON.stringify({ outputs: {} }))
    const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--json'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, EXPO_PUBLIC_COACH_DEV: '1', EXPO_PUBLIC_COACH_PROMOTE: '', COACH_EVIDENCE_ROOT: evidence },
    })
    assert.notEqual(result.status, 0)
  } finally {
    rmSync(evidence, { recursive: true, force: true })
  }
})


test('local gate rejects tampered shipped data without external evidence', () => {
  const copy = mkdtempSync(path.join(tmpdir(), 'coach-local-'))
  try {
    for (const dir of ['features/coach', 'lib/data', 'scripts/coach']) {
      mkdirSync(path.dirname(path.join(copy, dir)), { recursive: true })
      cpSync(path.join(root, dir), path.join(copy, dir), { recursive: true })
    }
    appendFileSync(path.join(copy, 'lib/data/coach/authoring-manifest.json'), ' ')
    const result = spawnSync(process.execPath, ['scripts/coach/gate.mjs', 'local'], {
      cwd: copy, encoding: 'utf8', env: { ...process.env, COACH_EVIDENCE_ROOT: path.join(copy, 'missing') },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Authoring manifest changed/)
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
})
