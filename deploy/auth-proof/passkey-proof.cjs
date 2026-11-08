// Disposable localhost-only provider test; do not use against a real instance.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');

const issuer = 'http://localhost:1411';
const binary = process.env.POCKET_ID_PROOF_BINARY;
if (!binary || process.env.APP_URL !== issuer || !process.env.ENCRYPTION_KEY) {
  throw new Error('Set POCKET_ID_PROOF_BINARY, APP_URL=http://localhost:1411 and the disposable ENCRYPTION_KEY');
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BINARY || '/usr/bin/google-chrome', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const makeAuthenticator = () => cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    } });
    const first = await makeAuthenticator();
    await page.goto(`${issuer}/setup`);
    await page.locator('#username').fill('proofadmin');
    await page.locator('#email').fill('proofadmin@example.test');
    await page.locator('#first-name').fill('Proof');
    await page.locator('#last-name').fill('Admin');
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await page.getByRole('button', { name: 'Add Passkey' }).first().click();
    await page.getByText('Account Details').waitFor();
    assert.equal((await cdp.send('WebAuthn.getCredentials', first)).credentials.length, 1);
    console.log('Initial administrator passkey enrolled');

    // Simulate losing the original authenticator before using the operator recovery path.
    await cdp.send('WebAuthn.removeVirtualAuthenticator', first);
    await context.clearCookies();
    const replacement = await makeAuthenticator();
    const output = execFileSync(binary, ['one-time-access-token', 'proofadmin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const link = output.match(/http:\/\/localhost:1411\/\S+/)?.[0];
    assert.ok(link, 'Provider did not produce a localhost recovery link');
    await page.goto(link);
    await page.getByText('Account Details').waitFor();
    await page.getByRole('button', { name: 'Add Passkey' }).first().click();
    await page.getByText('Name Passkey').waitFor();
    assert.equal((await cdp.send('WebAuthn.getCredentials', replacement)).credentials.length, 1);
    await context.clearCookies();
    await page.goto(`${issuer}/login`);
    await page.getByRole('button', { name: 'Authenticate' }).click();
    await page.getByText('Account Details').waitFor();
    console.log('Replacement passkey authenticated in a fresh browser session');
    await context.clearCookies();
    await page.goto(link);
    await page.getByText('Token is invalid or expired').waitFor();
    console.log('Reused recovery link rejected');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error.message.replace(/http:\/\/localhost:1411\/\S+/g, '[redacted URL]')); process.exitCode = 1; });
