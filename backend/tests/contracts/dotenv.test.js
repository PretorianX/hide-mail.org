/**
 * Production loads env with require('dotenv').config() in config.js and server.js.
 * dotenv 18 removes preloading and .env.vault; this locks the config() call those files use.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('dotenv config() contract', () => {
  const envKey = 'HIDEMAIL_DOTENV_CONTRACT';
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidemail-dotenv-'));
    delete process.env[envKey];
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loads a dotenv file through require and config()', () => {
    fs.writeFileSync(path.join(dir, '.env'), `${envKey}=from-file\n`);

    const dotenv = require('dotenv');
    const result = dotenv.config({ path: path.join(dir, '.env'), quiet: true });

    expect(result.error).toBeUndefined();
    expect(process.env[envKey]).toBe('from-file');
  });

  it('does not override a variable that is already set', () => {
    process.env[envKey] = 'already-set';
    fs.writeFileSync(path.join(dir, '.env'), `${envKey}=from-file\n`);

    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(dir, '.env'), quiet: true });

    expect(process.env[envKey]).toBe('already-set');
  });
});
