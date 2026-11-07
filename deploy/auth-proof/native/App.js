// Disposable native protocol client; it never accesses Active's local database.
import React, { useState } from 'react';
import { Button, ScrollView, Text, TextInput } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { KJUR, KEYUTIL, b64utoutf8 } from 'jsrsasign';

WebBrowser.maybeCompleteAuthSession();
const redirectUri = 'activenext://auth/callback';
const random = async () => Array.from(await Crypto.getRandomBytesAsync(32), n => n.toString(16).padStart(2, '0')).join('');

async function verify(token, discovery, audience, type) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const header = JSON.parse(b64utoutf8(parts[0]));
  const claims = JSON.parse(b64utoutf8(parts[1]));
  const response = await fetch(discovery.discoveryDocument.jwks_uri);
  if (!response.ok) throw new Error('JWKS request failed');
  const { keys } = await response.json();
  const key = keys.find(item => item.kid === header.kid && item.kty === 'RSA');
  if (!key || header.alg !== 'RS256' || (type && header.typ !== type) ||
      !KJUR.jws.JWS.verify(token, KEYUTIL.getKey(key), ['RS256']) ||
      claims.iss !== discovery.discoveryDocument.issuer || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 ||
      !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience) || !claims.sub) {
    throw new Error('JWT verification failed');
  }
  return claims;
}

export default function App() {
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [audience, setAudience] = useState('');
  const [result, setResult] = useState('Enter the HTTPS issuer, public client ID and API resource.');
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);

  async function login(testCase = 'normal') {
    setBusy(true);
    try {
      const base = new URL(issuer);
      if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || !clientId || !audience) throw new Error('Use an HTTPS issuer origin and fill every field');
      const discovery = await AuthSession.fetchDiscoveryAsync(base.origin);
      if (discovery.discoveryDocument?.issuer !== base.origin || !discovery.discoveryDocument.jwks_uri || !discovery.authorizationEndpoint || !discovery.tokenEndpoint || !discovery.endSessionEndpoint) throw new Error('Invalid discovery');
      const state = await random();
      const nonce = await random();
      const request = new AuthSession.AuthRequest({ clientId, redirectUri, responseType: AuthSession.ResponseType.Code,
        scopes: ['openid', 'profile', 'email', 'offline_access'], usePKCE: true, state,
        extraParams: { nonce, resource: audience } });
      const response = await request.promptAsync(discovery);
      if (response.type === 'cancel' || response.type === 'dismiss') { setResult('Cancelled. You can try again.'); return; }
      const expectedState = testCase === 'bad-state' ? await random() : state;
      if (response.type !== 'success' || response.params.state !== expectedState || !response.params.code || response.params.iss !== base.origin || !request.codeVerifier) throw new Error('Invalid callback or state');
      const tokens = await AuthSession.exchangeCodeAsync({ clientId, code: response.params.code, redirectUri,
        extraParams: { code_verifier: request.codeVerifier } }, discovery);
      if (!tokens.idToken || !tokens.accessToken || !tokens.refreshToken) throw new Error('Missing token');
      const id = await verify(tokens.idToken, discovery, clientId);
      const access = await verify(tokens.accessToken, discovery, audience, 'at+jwt');
      const expectedNonce = testCase === 'bad-nonce' ? await random() : nonce;
      if (id.nonce !== expectedNonce || id.sub !== access.sub) throw new Error('Nonce or subject mismatch');
      setSession({ discovery, clientId, audience, idToken: tokens.idToken, refreshToken: tokens.refreshToken, subject: id.sub,
        code: response.params.code, verifier: request.codeVerifier });
      setResult(`Signed in. Verified email: ${String(id.email_verified)}. Tokens stay in memory.`);
    } catch (error) { setSession(null); setResult(`Login failed: ${error.message}`); }
    finally { setBusy(false); }
  }
  async function replay() {
    if (!session) return;
    const previous = session;
    setSession(null);
    setBusy(true);
    try {
      const response = await fetch(previous.discovery.tokenEndpoint, { method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: previous.clientId,
          redirect_uri: redirectUri, code: previous.code, code_verifier: previous.verifier }).toString() });
      const body = await response.json();
      if (response.status !== 400 || body.error !== 'invalid_grant') throw new Error('Expected invalid_grant');
      setResult('Code replay rejected. Session cleared; sign in again for refresh tests.');
    } catch (error) { setResult(`Replay test failed: ${error.message}`); }
    finally { setBusy(false); }
  }
  async function refresh() {
    if (!session) return;
    setBusy(true);
    try {
      const tokens = await AuthSession.refreshAsync({ clientId: session.clientId, refreshToken: session.refreshToken }, session.discovery);
      if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Missing rotated tokens');
      const access = await verify(tokens.accessToken, session.discovery, session.audience, 'at+jwt');
      if (access.sub !== session.subject) throw new Error('Subject changed');
      setSession({ ...session, refreshToken: tokens.refreshToken });
      setResult('Refresh succeeded.');
    } catch (error) { setSession(null); setResult(`Refresh failed: ${error.message}`); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!session) return;
    const previous = session;
    setSession(null);
    try {
      const url = new URL(previous.discovery.endSessionEndpoint);
      url.searchParams.set('id_token_hint', previous.idToken);
      url.searchParams.set('client_id', previous.clientId);
      await WebBrowser.openBrowserAsync(url.toString());
      setResult('Local tokens cleared; verify provider logout and subsequent refresh separately.');
    } catch (error) { setResult(`Local tokens cleared; provider logout failed: ${error.message}`); }
  }
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
    <Text>Disposable OIDC native proof</Text>
    <TextInput accessibilityLabel="Issuer" placeholder="https://id.example.com" value={issuer} onChangeText={setIssuer} autoCapitalize="none" />
    <TextInput accessibilityLabel="Public client ID" placeholder="Public client ID" value={clientId} onChangeText={setClientId} autoCapitalize="none" />
    <TextInput accessibilityLabel="API resource" placeholder="https://api.example.com" value={audience} onChangeText={setAudience} autoCapitalize="none" />
    <Button title="Sign in" onPress={() => login()} disabled={busy || !!session} />
    <Button title="Test bad state" onPress={() => login('bad-state')} disabled={busy || !!session} />
    <Button title="Test bad nonce" onPress={() => login('bad-nonce')} disabled={busy || !!session} />
    <Button title="Refresh" onPress={refresh} disabled={busy || !session} />
    <Button title="Replay code and clear session" onPress={replay} disabled={busy || !session} />
    <Button title="Sign out" onPress={logout} disabled={busy || !session} />
    <Text selectable>{result}</Text>
  </ScrollView>;
}
