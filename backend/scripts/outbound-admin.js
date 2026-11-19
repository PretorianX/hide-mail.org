#!/usr/bin/env node
/**
 * Operator host script for outbound Send accounts, caps, and suspension.
 * Usage: docker compose exec backend node scripts/outbound-admin.js <command> [...args]
 */

const accountService = require('../services/outbound/accountService');
const domainService = require('../services/outbound/domainService');
const capService = require('../services/outbound/capService');
const accountRateLimiter = require('../services/outbound/accountRateLimiter');

const USAGE = `Usage:
  outbound-admin.js account create --name <label> --days <n>
  outbound-admin.js account extend --key <key> --days <n>
  outbound-admin.js account list
  outbound-admin.js account rate --account <id> --per-minute <n>
  outbound-admin.js domain limit --domain <name> --daily <n>
  outbound-admin.js domain limit --domain <name> --unlimited
  outbound-admin.js domain suspend --domain <name>
  outbound-admin.js domain resume --domain <name>
  outbound-admin.js domain release --domain <name>
  outbound-admin.js domain transfer --domain <name> --account <id>
`;

const parseArgs = (argv) => {
  const args = [...argv];
  const flags = {};
  const positionals = [];
  while (args.length > 0) {
    const token = args.shift();
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = args[0] && !args[0].startsWith('--') ? args.shift() : true;
      flags[key] = value;
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
};

const requireFlag = (flags, name) => {
  if (flags[name] === undefined || flags[name] === true || flags[name] === '') {
    throw new Error(`Missing required flag --${name}`);
  }
  return flags[name];
};

const commands = {
  'account create': async (flags) => {
    const label = requireFlag(flags, 'name');
    const days = Number(requireFlag(flags, 'days'));
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error('--days must be a positive number');
    }
    const created = await accountService.createAccount({ label, days });
    process.stdout.write(`Account created. Copy this licence key now — it is not shown again:\n${created.key}\n`);
    process.stdout.write(`accountId=${created.accountId} expiresAt=${created.expiresAt}\n`);
  },

  'account extend': async (flags) => {
    const key = requireFlag(flags, 'key');
    const days = Number(requireFlag(flags, 'days'));
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error('--days must be a positive number');
    }
    const updated = await accountService.extendAccount({ key, days });
    if (!updated) {
      throw new Error('Account/licence not found or not outbound');
    }
    process.stdout.write(`Extended. New expiresAt=${updated.expiresAt}\n`);
  },

  'account list': async () => {
    const accounts = await accountService.listAccounts();
    process.stdout.write('accountId\tlabel\tstatus\texpiresAt\n');
    for (const a of accounts) {
      process.stdout.write(`${a.accountId}\t${a.label}\t${a.status}\t${a.expiresAt}\n`);
    }
  },

  'account rate': async (flags) => {
    const accountId = requireFlag(flags, 'account');
    const perMinute = Number(requireFlag(flags, 'per-minute'));
    if (!Number.isFinite(perMinute) || perMinute <= 0) {
      throw new Error('--per-minute must be a positive number');
    }
    await accountRateLimiter.setOverride(accountId, perMinute);
    process.stdout.write(`Rate override set: account=${accountId} perMinute=${perMinute}\n`);
  },

  'domain limit': async (flags) => {
    const domain = requireFlag(flags, 'domain');
    if (flags.unlimited === true || flags.unlimited === 'true') {
      await capService.setDailyLimit(domain, null);
      process.stdout.write(`Domain ${domain} daily limit set to unlimited\n`);
      return;
    }
    const daily = Number(requireFlag(flags, 'daily'));
    if (!Number.isFinite(daily) || daily <= 0) {
      throw new Error('--daily must be a positive number');
    }
    await capService.setDailyLimit(domain, daily);
    process.stdout.write(`Domain ${domain} daily limit set to ${daily}\n`);
  },

  'domain suspend': async (flags) => {
    const domain = requireFlag(flags, 'domain');
    await domainService.setSuspended({ domain, suspended: true });
    process.stdout.write(`Domain ${domain} suspended\n`);
  },

  'domain resume': async (flags) => {
    const domain = requireFlag(flags, 'domain');
    await domainService.setSuspended({ domain, suspended: false });
    process.stdout.write(`Domain ${domain} resumed\n`);
  },

  'domain release': async (flags) => {
    const domain = requireFlag(flags, 'domain');
    const result = await domainService.releaseDomain({ domain });
    process.stdout.write(`Domain ${result.domain} released (was owned by ${result.previousAccountId})\n`);
  },

  'domain transfer': async (flags) => {
    const domain = requireFlag(flags, 'domain');
    const toAccountId = requireFlag(flags, 'account');
    const result = await domainService.transferDomain({ domain, toAccountId });
    process.stdout.write(`Domain ${result.domain} transferred from ${result.fromAccountId} to ${result.toAccountId}\n`);
  },
};

const main = async (argv = process.argv.slice(2)) => {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals.slice(0, 2).join(' ');
  const handler = commands[command];
  if (!handler) {
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return 1;
  }
  try {
    await handler(flags);
    process.exitCode = 0;
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exitCode = 1;
    return 1;
  }
};

if (require.main === module) {
  main().then((code) => {
    // Allow pending I/O then exit explicitly for CLI use.
    process.exit(code);
  });
}

module.exports = {
  commands,
  parseArgs,
  main,
};
