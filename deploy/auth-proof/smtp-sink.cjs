// Local, disposable mailbox. Message content includes secret verification links.
const { SMTPServer } = require('smtp-server');
const { randomUUID } = require('node:crypto');
const { mkdtempSync } = require('node:fs');
const { writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const directory = mkdtempSync(join(tmpdir(), 'active-oidc-proof-mail-'));
const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ['AUTH', 'STARTTLS'],
  onData(stream, _session, callback) {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', callback);
    stream.on('end', () => {
      const output = join(directory, `${randomUUID()}.eml`);
      writeFile(output, Buffer.concat(chunks), { mode: 0o600, flag: 'wx' })
        .then(() => { console.log(`Message saved: ${output}`); callback(); }, callback);
    });
  },
});
server.listen(2525, '127.0.0.1', () => console.log(`Local SMTP sink listening on 127.0.0.1:2525; private mailbox: ${directory}`));
