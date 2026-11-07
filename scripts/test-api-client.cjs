const assert = require('node:assert/strict')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const dir = 'target/contract-client'
execFileSync('node_modules/.bin/tsc', ['--outDir', dir, '--strict', '--skipLibCheck', '--resolveJsonModule', '--esModuleInterop', '--moduleResolution', 'node16', '--module', 'node16', '--target', 'es2022', 'packages/api-client/src/index.ts'])
for (const file of ['request-contract.cjs', 'response-contract.cjs']) fs.copyFileSync(`packages/api-client/src/${file}`, `${dir}/${file}`)
const { createClient, ApiError } = require(`../${dir}/index.js`)
const empty = { path: {}, query: {}, body: null }
;(async () => {
  let sent
  const call = createClient('https://active.example', { kind: 'bearer', token: 'token' }, async (url, init) => {
    sent = { url, init }
    return new Response(JSON.stringify({ historyRevision: 4, futureField: true }), { status: 200 })
  })
  assert.deepEqual(await call('history.revision', empty), { historyRevision: 4 })
  assert.equal(sent.url, 'https://active.example/api/history/revision')
  assert.equal(sent.init.headers.Authorization, 'Bearer token')
  assert.equal(sent.init.headers['X-Active-Contract-Version'], '1')
  await assert.rejects(() => call('record.delete', { path: { id: 'a/b' }, query: { baseVersion: 1 }, body: null }), /Idempotency-Key/)
  for (const id of ['.', '..']) {
    await assert.rejects(() => call('routine.get', { path: { id }, query: {}, body: null }))
  }
  let addressed
  const address = createClient('https://active.example', { kind: 'none' }, async url => {
    addressed = url
    return new Response('{}', { status: 200 })
  })
  await assert.rejects(() => address('routine.get', { path: { id: 'a/b' }, query: {}, body: null }))
  assert.equal(addressed, 'https://active.example/api/routines/a%2Fb')
  const fail = createClient('https://active.example', { kind: 'none' }, async () => new Response(JSON.stringify({ code: 'INCOMPATIBLE_VERSION', message: 'Unsupported', currentVersion: null }), { status: 426, headers: { 'x-request-id': 'request-1' } }))
  await assert.rejects(() => fail('history.revision', empty), e => e instanceof ApiError && e.status === 426 && e.body.code === 'INCOMPATIBLE_VERSION' && e.requestId === 'request-1')
  assert.throws(() => createClient('https://active.example', { kind: 'session', csrfToken: 'csrf' }), /same-origin/)
  global.location = new URL('https://active.example/app')
  const session = createClient('https://active.example', { kind: 'session', csrfToken: 'csrf' }, async (url, init) => {
    assert.equal(init.credentials, 'same-origin')
    assert.equal(init.headers['X-CSRF-Token'], 'csrf')
    return new Response(JSON.stringify({ historyRevision: 1 }), { status: 200 })
  })
  await session('history.revision', empty)
  assert.throws(() => createClient('https://other.example', { kind: 'session', csrfToken: 'csrf' }), /same-origin/)
  assert.throws(() => createClient('https://active.example', { kind: 'session', csrfToken: '' }), /same-origin/)
  delete global.location
  const invalid = createClient('https://active.example', { kind: 'none' }, async () => new Response(JSON.stringify({ historyRevision: -1 }), { status: 200 }))
  await assert.rejects(() => invalid('history.revision', empty))
  console.log('Client request, compatibility error and invalid response checks passed.')
})().catch(error => { console.error(error); process.exitCode = 1 })
