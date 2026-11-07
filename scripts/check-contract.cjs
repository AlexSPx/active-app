const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { requests } = require('../contracts/v1/request-contract.cjs')
const { responses, error } = require('../contracts/v1/response-contract.cjs')
const { operations } = require('../contracts/v1/release-operations.json')
const outputs = ['contracts/v1/openapi.json', 'packages/api-client/src/generated.ts', 'packages/api-client/src/operation-types.ts', 'packages/api-client/src/operations.json', 'packages/api-client/src/request-contract.cjs', 'packages/api-client/src/response-contract.cjs']
const before = outputs.map(file => fs.readFileSync(file, 'utf8'))
execFileSync(process.execPath, ['scripts/generate-contract.cjs'], { stdio: 'inherit' })
outputs.forEach((file, i) => assert.equal(fs.readFileSync(file, 'utf8'), before[i], `${file} is stale; run yarn contract:generate`))
for (const op of operations.filter(o => requests[o.id])) {
  const body = op.id.startsWith('legal.') ? op.success.body.content : op.success.body
  responses[op.id].parse(body)
  error.parse(op.error.body)
  if (op.conflict) error.parse(op.conflict.body)
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'active-contract-'))
try {
  execFileSync('cargo', ['test', '--locked', '-p', 'active-api', '--test', 'operations', 'readiness_identity_discovery_and_limits'], { stdio: 'inherit', env: { ...process.env, ACTIVE_CONTRACT_FIXTURES: dir } })
  execFileSync('cargo', ['test', '--locked', '-p', 'active-api', '--test', 'boundary'], { stdio: 'inherit', env: { ...process.env, ACTIVE_CONTRACT_FIXTURES: dir } })
  execFileSync('cargo', ['test', '--locked', '-p', 'active-api', '--test', 'request_dtos'], { stdio: 'inherit', env: { ...process.env, ACTIVE_CONTRACT_FIXTURES: dir } })
  execFileSync('cargo', ['test', '--locked', '-p', 'active-api', '--test', 'response_dtos'], { stdio: 'inherit', env: { ...process.env, ACTIVE_CONTRACT_FIXTURES: dir } })
  const responseFixtures = JSON.parse(fs.readFileSync(path.join(dir, 'responses.json')))
  for (const [id, schema] of Object.entries(responses)) {
    if (id === 'discovery') continue
    assert.ok(Object.hasOwn(responseFixtures, id), `missing Rust response DTO fixture for ${id}`)
    const value = responseFixtures[id]
    schema.parse(value)
    const invalid = typeof value === 'string' ? null : Array.isArray(value) ? [null] : null
    assert.equal(schema.safeParse(invalid).success, false, `invalid Rust response accepted for ${id}`)
  }
  const corrupt = (id, mutate) => {
    const value = structuredClone(responseFixtures[id])
    mutate(value)
    assert.equal(responses[id].safeParse(value).success, false, `invalid nested response accepted for ${id}`)
  }
  corrupt('profile.get', v => { v.measurements.weightKg = 0 })
  corrupt('profile.update', v => { delete v.timezone })
  corrupt('catalog.get', v => { v.items[0].category = 'UNKNOWN' })
  corrupt('progression.logs', v => { v[0].createdAt = 'yesterday' })
  corrupt('workout.create', v => { v.workoutTemplate.exercises[0].exerciseId = '..' })
  corrupt('workout.delete', v => { v.routineVersions[0].version = 0 })
  corrupt('routine.get', v => { v.pattern[0].dayIndex = 1 })
  corrupt('routine.get', v => { v.pattern[1].workoutId = 'w' })
  corrupt('record.create', v => { v.workoutRecord.completedAt = '2020-01-01T00:00:00Z' })
  corrupt('record.list', v => { v[0].exerciseRecords[0].identity.sourceKey = null })
  corrupt('record.list', v => { v[0].exerciseRecords[0].weight = [] })
  corrupt('snapshot.get', v => { v.nextWorkoutDeadline = '2023-02-29' })
  corrupt('preferences.get', v => { v.schedule = ['24:00'] })
  const requestFixtures = JSON.parse(fs.readFileSync(path.join(dir, 'requests.json')))
  for (const [id, request] of Object.entries(requests)) {
    for (const part of ['body', 'query', 'path']) {
      const key = part === 'body' ? id : part === 'path' ? (request.path.safeParse({ id: 'x' }).success ? 'path' : 'empty') : ({ 'profile.delete': 'version', 'workout.delete': 'version', 'record.delete': 'version', 'routine.delete': 'routine.delete', 'catalog.search': 'catalog.search' }[id] || 'empty')
      if (part === 'body' && request.body.safeParse(null).success) continue
      const fixture = requestFixtures[key]
      assert.ok(fixture, `missing Rust fixture for ${id} ${part}`)
      request[part].parse(fixture.valid)
      assert.equal(request[part].safeParse(fixture.invalid).success, false, `invalid Rust fixture accepted for ${id} ${part}`)
    }
  }
  for (const id of ['.', '..']) {
    assert.equal(requests['routine.get'].path.safeParse({ id }).success, false)
    assert.equal(requests['workout.create'].body.safeParse({ title: 'A', template: { exercises: [{ exerciseId: id }] } }).success, false)
    assert.equal(requests['routine.update'].body.safeParse({ baseVersion: 1, pattern: [{ dayIndex: 0, dayType: 'WORKOUT', workoutId: id }] }).success, false)
  }
  for (const id of ['a/b', '.hidden', '...', '%2e', 'é', '.\n']) assert.equal(requests['routine.get'].path.safeParse({ id }).success, true)
  for (const code of ['VALIDATION_ERROR', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'STALE_VERSION']) {
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`)))
    error.parse(fixture)
    assert.equal(fixture.code, code)
  }
  const discovery = JSON.parse(fs.readFileSync(path.join(dir, 'discovery.json')))
  const failure = JSON.parse(fs.readFileSync(path.join(dir, 'error.json')))
  responses.discovery.parse(discovery)
  error.parse(failure)
  assert.equal(responses.discovery.safeParse({ ...discovery, contractVersion: '2' }).success, false)
  assert.equal(error.safeParse({ ...failure, currentVersion: '2' }).success, false)
} finally { fs.rmSync(dir, { recursive: true, force: true }) }
execFileSync(process.execPath, ['scripts/test-api-client.cjs'], { stdio: 'inherit' })
console.log('Contract examples and Rust response fixtures validated; invalid controls rejected.')
