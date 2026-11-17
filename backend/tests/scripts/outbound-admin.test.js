process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const path = require('path');
const { execFileSync } = require('child_process');
const redisService = require('../../services/redisService');
const accountService = require('../../services/outbound/accountService');
const domainService = require('../../services/outbound/domainService');
const capService = require('../../services/outbound/capService');
const { commands, main, parseArgs } = require('../../scripts/outbound-admin');

describe('outbound-admin script', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('account create returns a printable licence key', async () => {
    const logs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      logs.push(String(chunk));
      return true;
    };
    try {
      await commands['account create']({ name: 'Acme', days: '30' });
    } finally {
      process.stdout.write = originalWrite;
    }
    const out = logs.join('');
    expect(out).toMatch(/HM-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+/);
    expect(out).toMatch(/Copy this licence key now/);
  });

  it('domain limit --unlimited sets dailyLimit to null', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    await domainService.addDomain({ accountId: account.accountId, domain: 'mail.example.com' });

    const logs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      logs.push(String(chunk));
      return true;
    };
    try {
      await commands['domain limit']({ domain: 'mail.example.com', unlimited: true });
    } finally {
      process.stdout.write = originalWrite;
    }

    await expect(capService.getDailyLimit('mail.example.com')).resolves.toBeNull();
  });

  it('unknown command exits non-zero with usage', async () => {
    const err = [];
    const originalErr = process.stderr.write;
    process.stderr.write = (chunk) => {
      err.push(String(chunk));
      return true;
    };
    try {
      const code = await main(['nope']);
      expect(code).toBe(1);
    } finally {
      process.stderr.write = originalErr;
    }
    expect(err.join('')).toMatch(/Usage:/);
  });

  it('account rate without --per-minute exits non-zero without touching Redis', async () => {
    const before = { ...redisService.client.data };
    const err = [];
    const originalErr = process.stderr.write;
    process.stderr.write = (chunk) => {
      err.push(String(chunk));
      return true;
    };
    try {
      const code = await main(['account', 'rate', '--account', 'acct-1']);
      expect(code).toBe(1);
    } finally {
      process.stderr.write = originalErr;
    }
    expect(err.join('')).toMatch(/Missing required flag --per-minute/);
    expect(redisService.client.data).toEqual(before);
  });

  it('parseArgs reads --flag value pairs', () => {
    expect(parseArgs(['account', 'create', '--name', 'Acme', '--days', '30'])).toEqual({
      positionals: ['account', 'create'],
      flags: { name: 'Acme', days: '30' },
    });
  });

  it('CLI entrypoint wires argv for an unknown command', () => {
    const script = path.join(__dirname, '../../scripts/outbound-admin.js');
    expect(() =>
      execFileSync(process.execPath, [script, 'nope'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          VALID_DOMAINS: 'hide-mail.org',
          OUTBOUND_KEY_ENCRYPTION_SECRET: 'test-secret-for-outbound-domain-keys',
        },
      })
    ).toThrow();
  });
});
