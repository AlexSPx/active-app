// Disposable loopback protocol probe, not an application session implementation.
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const issuer = 'http://localhost:1411';
const redirect = 'http://localhost:1412/callback';
const resource = 'https://active.example.test/api';
const client = process.env.POCKET_ID_CLIENT_ID;
const testCase = process.env.POCKET_ID_PROOF_CASE || 'code-replay';
if (!['code-replay', 'refresh-logout', 'refresh-reuse', 'bad-nonce', 'bad-verifier'].includes(testCase)) throw new Error('Unknown proof case');
if (!client) throw new Error('Set POCKET_ID_CLIENT_ID to the public proof client ID');
const random = () => crypto.randomBytes(32).toString('base64url');
let pending;
let completed = false;

async function json(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}
async function token(fields) {
  return json(`${issuer}/api/oidc/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client, ...fields }),
  });
}
async function verify(jwt, audience) {
  const parts = jwt.split('.');
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.equal(header.alg, 'RS256');
  const { body } = await json(`${issuer}/.well-known/jwks.json`);
  const jwk = body.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  assert.ok(jwk, 'signing key');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url')), 'signature');
  assert.equal(claims.iss, issuer);
  assert.ok((Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience), 'audience');
  assert.ok(claims.exp > Date.now() / 1000, 'expiry');
  return { header, claims };
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:1412');
    if (url.pathname === '/') {
      const verifier = random();
      pending = { state: random(), nonce: random(), verifier };
      const params = new URLSearchParams({ response_type: 'code', client_id: client, redirect_uri: redirect,
        scope: 'openid profile email offline_access', state: pending.state, nonce: pending.nonce,
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource });
      res.writeHead(302, { location: `${issuer}/authorize?${params}`, 'cache-control': 'no-store' });
      return res.end();
    }
    if (url.pathname !== '/callback') { res.writeHead(404); return res.end(); }
    assert.ok(pending && !completed, 'unsolicited or replayed callback');
    assert.equal(url.searchParams.get('state'), pending.state, 'state');
    assert.equal(url.searchParams.get('iss'), issuer, 'authorization issuer');
    assert.ok(!url.searchParams.has('error'), 'authorization denied');
    const code = url.searchParams.get('code');
    assert.ok(code, 'code');
    const transaction = pending;
    pending = null;
    const exchange = { grant_type: 'authorization_code', code, redirect_uri: redirect,
      code_verifier: testCase === 'bad-verifier' ? random() : transaction.verifier };
    const first = await token(exchange);
    if (testCase === 'bad-verifier') {
      assert.notEqual(first.response.status, 200, 'wrong verifier');
      completed = true;
      console.log(`Wrong verifier rejected: HTTP ${first.response.status}`);
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      return res.end('Wrong verifier rejected.');
    }
    assert.equal(first.response.status, 200, 'code exchange');
    const id = await verify(first.body.id_token, client);
    if (testCase === 'bad-nonce') {
      assert.throws(() => assert.equal(id.claims.nonce, random(), 'nonce'), /nonce/);
      completed = true;
      console.log('Mismatched nonce rejected by the probe.');
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      return res.end('Mismatched nonce rejected by the probe.');
    }
    assert.equal(id.claims.nonce, transaction.nonce, 'nonce');
    await assert.rejects(() => verify(first.body.id_token, resource), /audience/);
    const access = await verify(first.body.access_token, resource);
    assert.equal(access.header.typ, 'at+jwt', 'access token type');
    assert.equal(access.claims.sub, id.claims.sub, 'subject');
    assert.ok(first.body.refresh_token, 'refresh token');
    if (testCase === 'code-replay') {
      const replay = await token(exchange);
      assert.equal(replay.response.status, 400, 'code replay status');
      assert.equal(replay.body.error, 'invalid_grant', 'code replay error');
      completed = true;
      console.log(`Code replay rejected with invalid_grant; email_verified=${String(id.claims.email_verified)}.`);
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      return res.end('Code replay rejected with invalid_grant.');
    }
    const refreshed = await token({ grant_type: 'refresh_token', refresh_token: first.body.refresh_token });
    assert.equal(refreshed.response.status, 200, 'refresh');
    assert.ok(refreshed.body.refresh_token, 'rotated refresh token');
    const refreshedAccess = await verify(refreshed.body.access_token, resource);
    assert.equal(refreshedAccess.header.typ, 'at+jwt', 'refreshed access token type');
    assert.equal(refreshedAccess.claims.sub, id.claims.sub, 'refresh subject');
    if (testCase === 'refresh-reuse') {
      const immediate = await token({ grant_type: 'refresh_token', refresh_token: first.body.refresh_token });
      assert.equal(immediate.response.status, 200, 'immediate refresh retry');
      console.log('Immediate old refresh token retry accepted; waiting 65 seconds for grace expiry.');
      await new Promise(resolve => setTimeout(resolve, 65_000));
      const late = await token({ grant_type: 'refresh_token', refresh_token: first.body.refresh_token });
      assert.equal(late.response.status, 400, 'late refresh replay status');
      assert.equal(late.body.error, 'invalid_grant', 'late refresh replay error');
      completed = true;
      console.log('Old refresh token rejected after grace with invalid_grant.');
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      return res.end('Immediate retry accepted; old token rejected after grace with invalid_grant.');
    }
    const confirmed = await token({ grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token });
    assert.equal(confirmed.response.status, 200, 'rotated refresh token works');
    assert.ok(confirmed.body.refresh_token, 'second rotated refresh token');
    const confirmedAccess = await verify(confirmed.body.access_token, resource);
    assert.equal(confirmedAccess.header.typ, 'at+jwt', 'second refreshed access token type');
    assert.equal(confirmedAccess.claims.sub, id.claims.sub, 'second refresh subject');
    const logout = await fetch(`${issuer}/api/oidc/end-session`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token_hint: first.body.id_token, client_id: client }),
    });
    assert.equal(logout.status, 302, 'end session');
    const afterLogout = await token({ grant_type: 'refresh_token', refresh_token: confirmed.body.refresh_token });
    assert.equal(afterLogout.response.status, 400, 'refresh after logout status');
    assert.equal(afterLogout.body.error, 'invalid_grant', 'refresh after logout error');
    completed = true;
    const result = `Code + S256, signed nonce and API audience, rotated refresh token, and logout invalid_grant passed.\nEmail verified: ${String(id.claims.email_verified)}.\n`;
    console.log(result);
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    res.end(result);
  } catch (error) {
    pending = null;
    const reason = error.message.split('\n')[0];
    console.error('Proof failed:', reason);
    res.writeHead(400, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end(`Proof failed: ${reason}`);
  }
});
server.listen(1412, '127.0.0.1', () => console.log('Open http://localhost:1412/ in the browser with the provider session.'));
