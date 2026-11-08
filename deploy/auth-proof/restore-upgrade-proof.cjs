// Disposable local proof: never point this script at an existing provider database.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require('playwright-core');

const oldBinary = process.env.POCKET_ID_OLD_BINARY;
const newBinary = process.env.POCKET_ID_NEW_BINARY;
if (!oldBinary || !newBinary) throw new Error('Set absolute paths in POCKET_ID_OLD_BINARY and POCKET_ID_NEW_BINARY');
const issuer = 'http://localhost:1411';
const env = { PATH: process.env.PATH, APP_URL: issuer, ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  ANALYTICS_DISABLED: 'true', VERSION_CHECK_DISABLED: 'true', HOST: '127.0.0.1' };

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'active-restore-proof-'));
  let provider, browser;
  async function stop() {
    if (!provider) return;
    const process = provider;
    provider = undefined;
    if (process.exitCode !== null || process.signalCode !== null) throw new Error('Provider exited unexpectedly');
    const exited = once(process, 'exit');
    process.kill('SIGTERM');
    const [code, signal] = await exited;
    assert.ok(code === 0 || signal === 'SIGTERM', 'Provider did not stop cleanly');
  }
  async function start(binary, cwd) {
    provider = spawn(binary, [], { cwd, env, stdio: 'ignore' });
    await once(provider, 'spawn');
    for (let i = 0; i < 100; i++) {
      if (provider.exitCode !== null || provider.signalCode !== null) throw new Error('Provider failed to start');
      try {
        const response = await fetch(`${issuer}/.well-known/openid-configuration`);
        if (response.ok && (await response.json()).issuer === issuer) return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Provider did not become ready');
  }
  try {
    // Refuse an occupied port; discovery from another instance is not evidence.
    try { await fetch(`${issuer}/.well-known/openid-configuration`); throw new Error('Port 1411 is already in use'); }
    catch (error) { if (error.message === 'Port 1411 is already in use') throw error; }
    const original = path.join(root, 'original'), backup = path.join(root, 'backup'), restored = path.join(root, 'restored');
    await fs.mkdir(original); await start(oldBinary, original);
    browser = await chromium.launch({ executablePath: process.env.CHROME_BINARY || '/usr/bin/google-chrome', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const authenticator = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    } });
    await page.goto(`${issuer}/setup`);
    await page.locator('#username').fill('proofadmin');
    await page.locator('#email').fill('proofadmin@example.test');
    await page.locator('#first-name').fill('Proof');
    await page.locator('#last-name').fill('Admin');
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await page.getByRole('button', { name: 'Add Passkey' }).first().click();
    await page.getByText('Account Details').waitFor();
    assert.equal((await cdp.send('WebAuthn.getCredentials', authenticator)).credentials.length, 1);
    await stop();
    await fs.mkdir(backup); await fs.cp(path.join(original, 'data'), path.join(backup, 'data'), { recursive: true });
    await fs.mkdir(restored); await fs.cp(path.join(backup, 'data'), path.join(restored, 'data'), { recursive: true });
    async function login() {
      await context.clearCookies();
      await page.goto(`${issuer}/login`);
      await page.getByRole('button', { name: 'Authenticate' }).click();
      await page.getByText('Account Details').waitFor();
    }
    await start(newBinary, restored); await login();
    console.log('Upgraded restored account authenticated with its existing passkey');
    await stop();
    await start(oldBinary, backup); await login();
    console.log('Untouched old-version backup authenticated after rollback');
  } finally {
    try { if (provider) await stop(); }
    finally {
      try { if (browser) await browser.close(); }
      finally { await fs.rm(root, { recursive: true, force: true }); }
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
