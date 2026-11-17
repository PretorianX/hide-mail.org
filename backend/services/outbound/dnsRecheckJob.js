const redisService = require('../redisService');
const logger = require('../../utils/logger');
const domainService = require('./domainService');
const metricsStore = require('./outboundMetricsStore');

const GLOBAL_DOMAINS_INDEX = 'outbound:domains:index';
const META_PREFIX = 'outbound:domain:meta:';

const recordDnsOutcomes = async (domain, records) => {
  if (!Array.isArray(records)) {
    return;
  }
  for (const record of records) {
    let outcome = 'fail';
    if (record.status === 'pass') {
      outcome = 'pass';
    } else if (record.reason === 'no_answer') {
      outcome = 'no_answer';
    }
    await metricsStore.incrDnsOutcome(domain, outcome);
  }
};

const runOnce = async () => {
  const domains = await redisService.client.smembers(GLOBAL_DOMAINS_INDEX);
  const becameBroken = [];
  let checked = 0;

  for (const domain of domains) {
    try {
      const meta = JSON.parse(await redisService.client.get(`${META_PREFIX}${domain}`));
      const result = await domainService.checkDomain({ accountId: meta.accountId, domain });
      checked += 1;
      await recordDnsOutcomes(domain, result.records);

      if (result.state === 'broken' && meta.state !== 'broken') {
        becameBroken.push(domain);
      }
    } catch (error) {
      logger.error(`Outbound DNS recheck failed for ${domain}`, error);
    }
  }

  logger.info(
    `Outbound DNS recheck completed: checked=${checked}, becameBroken=${becameBroken.join(',')}`
  );
  return { checked, becameBroken };
};

const start = () => {
  const intervalSeconds = Number(process.env.OUTBOUND_DNS_RECHECK_SECONDS || 3600);
  const timer = setInterval(
    () => runOnce().catch((error) => logger.error('DNS recheck job failed', error)),
    intervalSeconds * 1000
  );
  timer.unref();
  return () => clearInterval(timer);
};

module.exports = {
  runOnce,
  start,
};
