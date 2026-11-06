// Local-only confidential-client session probe. Not a production web server.
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const issuer = 'http://localhost:1411';
const origin = 'http://localhost:1413';
const redirect = `${origin}/callback`;
const resource = 'https://active.example.test/api';
const client = process.env.POCKET_ID_WEB_CLIENT_ID;
const secret = process.env.POCKET_ID_WEB_CLIENT_SECRET;
if (!client || !secret) throw new Error('Set the confidential web client ID and secret');
const random = () => crypto.randomBytes(32).toString('base64url');
const sessions = new Map();
const cookies = req => Object.fromEntries((req.headers.cookie || '').split('; ').map(pair => pair.split('=')));
const send = (res, status, message, headers = {}) => { res.writeHead(status, { 'content-type': 'text/plain', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...headers }); res.end(message); };
const cookie = value => `proof_session=${value}; HttpOnly; SameSite=Lax; Path=/`;
async function token(fields) {
  const response = await fetch(`${issuer}/api/oidc/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${encodeURIComponent(client)}:${encodeURIComponent(secret)}`).toString('base64')}` },
    body: new URLSearchParams(fields) });
  return { response, body: await response.json() };
}
async function verify(jwt, audience, type) {
  const parts = jwt.split('.'); assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  const jwks = await (await fetch(`${issuer}/.well-known/jwks.json`)).json();
  const key = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
  assert.ok(key); assert.equal(header.alg, 'RS256');
  if (type) assert.equal(header.typ, type);
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url')));
  assert.equal(claims.iss, issuer); assert.ok(claims.exp > Date.now() / 1000);
  assert.ok((Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience));
  assert.ok(claims.sub); return claims;
}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    const id = cookies(req).proof_session;
    const session = sessions.get(id);
    if (req.method === 'GET' && url.pathname === '/') {
      if (!session?.subject) return send(res, 200, 'Open /login to start the confidential web login.');
      return send(res, 200, `Signed in. Verified email: ${session.emailVerified}. CSRF token: ${session.csrf}\nPOST /refresh or /logout with X-CSRF-Token and Origin ${origin}.`);
    }
    if (req.method === 'GET' && url.pathname === '/login') {
      if (id) sessions.delete(id);
      const next = random(), state = random(), nonce = random(), verifier = random();
      sessions.set(next, { state, nonce, verifier });
      const query = new URLSearchParams({ response_type: 'code', client_id: client, redirect_uri: redirect,
        scope: 'openid profile email offline_access', state, nonce, resource, code_challenge_method: 'S256',
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') });
      res.writeHead(302, { location: `${issuer}/authorize?${query}`, 'set-cookie': cookie(next), 'cache-control': 'no-store' }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/callback') {
      assert.ok(session?.state && url.searchParams.get('state') === session.state, 'state');
      assert.equal(url.searchParams.get('iss'), issuer, 'issuer');
      const code = url.searchParams.get('code'); assert.ok(code, 'code');
      sessions.delete(id);
      const exchange = await token({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: session.verifier });
      assert.equal(exchange.response.status, 200, 'exchange');
      const identity = await verify(exchange.body.id_token, client);
      assert.equal(identity.nonce, session.nonce, 'nonce');
      const access = await verify(exchange.body.access_token, resource, 'at+jwt');
      assert.equal(identity.sub, access.sub); assert.equal(identity.email_verified, true, 'verified email required');
      assert.ok(exchange.body.refresh_token);
      const next = random();
      sessions.set(next, { subject: identity.sub, emailVerified: true, idToken: exchange.body.id_token, refreshToken: exchange.body.refresh_token, csrf: random() });
      res.writeHead(303, { location: '/', 'set-cookie': cookie(next), 'cache-control': 'no-store' }); return res.end();
    }
    if (req.method === 'POST' && ['/logout', '/refresh'].includes(url.pathname)) {
      assert.ok(session?.subject, 'session');
      assert.equal(req.headers.origin, origin, 'origin');
      assert.equal(req.headers['x-csrf-token'], session.csrf, 'csrf');
      if (url.pathname === '/refresh') {
        const refreshed = await token({ grant_type: 'refresh_token', refresh_token: session.refreshToken });
        assert.equal(refreshed.response.status, 200, 'refresh'); assert.ok(refreshed.body.refresh_token);
        const access = await verify(refreshed.body.access_token, resource, 'at+jwt');
        assert.equal(access.sub, session.subject); session.refreshToken = refreshed.body.refresh_token;
        return send(res, 200, 'Refreshed.');
      }
      sessions.delete(id);
      const end = await fetch(`${issuer}/api/oidc/end-session`, { method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token_hint: session.idToken, client_id: client }) });
      assert.equal(end.status, 302);
      return send(res, 200, 'Session cleared and provider end-session requested.', { 'set-cookie': cookie('') + '; Max-Age=0' });
    }
    send(res, 404, 'Not found.');
  } catch (error) {
    if (req.url.startsWith('/callback') && cookies(req).proof_session) sessions.delete(cookies(req).proof_session);
    const reason = error.message.split('\n')[0]; console.error('Web proof failed:', reason);
    send(res, 400, `Web proof failed: ${reason}`);
  }
}).listen(1413, '127.0.0.1', () => console.log(`Open ${origin}/login`));
