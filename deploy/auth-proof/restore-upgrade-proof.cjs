// Disposable local proof: never point this script at an existing provider database.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const net = require('node:net');
const { promisify } = require('node:util');
const { once } = require('node:events');
const { chromium } = require('playwright-core');

const oldBinary = process.env.POCKET_ID_OLD_BINARY;
const newBinary = process.env.POCKET_ID_NEW_BINARY;
if (!oldBinary || !newBinary) throw new Error('Set absolute paths in POCKET_ID_OLD_BINARY and POCKET_ID_NEW_BINARY');
const issuer = 'http://localhost:1411';
const env = { PATH: process.env.PATH, APP_URL: issuer, ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  ANALYTICS_DISABLED: 'true', VERSION_CHECK_DISABLED: 'true', HOST: '127.0.0.1' };

async function main() {
  const rootPromise = fs.mkdtemp(path.join(os.tmpdir(), 'active-restore-proof-'));
  let root;
  let provider, browser, browserLaunch, stopping, cleaning, interrupted = false;
  async function stop(strict = true) {
    if (stopping) return stopping;
    stopping = stopProvider(strict);
    try { await stopping; } finally { stopping = undefined; }
  }
  async function stopProvider(strict) {
    if (!provider) return;
    const process = provider;
    provider = undefined;
    if (process.exitCode !== null || process.signalCode !== null) {
      if (strict) throw new Error('Provider exited unexpectedly');
      return;
    }
    const exited = once(process, 'exit');
    process.kill('SIGTERM');
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), 3000); });
    let result = await Promise.race([exited, timeout]);
    clearTimeout(timer);
    if (!result) {
      process.kill('SIGKILL');
      result = await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => resolve(null), 3000); })]);
      clearTimeout(timer);
    }
    if (!result) throw new Error('Provider did not exit after SIGKILL');
    const [code, signal] = result;
    assert.ok(code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL', 'Provider did not stop cleanly');
  }
  async function start(binary, cwd) {
    if (interrupted) throw new Error('Interrupted');
    provider = spawn(binary, [], { cwd, env, stdio: 'ignore' });
    const child = provider;
    await once(child, 'spawn');
    for (let i = 0; i < 100; i++) {
      if (interrupted) throw new Error('Interrupted');
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Provider failed to start');
      try {
        const response = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(500) });
        if (response.ok && (await response.json()).issuer === issuer) {
          await promisify(execFile)('lsof', ['-nP', '-a', '-p', String(child.pid), '-iTCP:1411', '-sTCP:LISTEN'], { timeout: 1000 });
          if (interrupted) throw new Error('Interrupted');
          return;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Provider did not become ready');
  }
  async function cleanup() {
    if (cleaning) return cleaning;
    cleaning = (async () => {
      try { await stop(false); }
      finally {
        try {
          if (browserLaunch) await browserLaunch.catch(() => {});
          if (browser) await browser.close();
        }
        finally {
          const directory = await rootPromise.catch(() => undefined);
          if (directory) await fs.rm(directory, { recursive: true, force: true });
        }
      }
    })();
    return cleaning;
  }
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.on(signal, () => {
      if (interrupted) return;
      interrupted = true;
      cleanup().catch(error => console.error(error.message)).finally(() => process.exit(code));
    });
  }
  try {
    root = await rootPromise;
    if (interrupted) throw new Error('Interrupted');
    // Binding catches listeners regardless of their HTTP behavior.
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      const timer = setTimeout(() => { server.close(); reject(new Error('Port check timed out')); }, 1000);
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.listen({ host: '127.0.0.1', port: 1411, exclusive: true }, () => {
        clearTimeout(timer);
        server.close(resolve);
      });
    });
    const original = path.join(root, 'original'), backup = path.join(root, 'backup'), restored = path.join(root, 'restored');
    await fs.mkdir(original); await start(oldBinary, original);
    browserLaunch = chromium.launch({ executablePath: process.env.CHROME_BINARY || '/usr/bin/google-chrome', headless: true, env: { ...process.env, TMPDIR: root }, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }).then(value => { browser = value; });
    await browserLaunch;
    if (interrupted) throw new Error('Interrupted');
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
    await cleanup();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
