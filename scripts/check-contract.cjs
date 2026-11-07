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
