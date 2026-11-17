/**
 * Customer Prometheus scrape. Authenticated via requireMetricsToken.
 */

const client = require('prom-client');
const renderer = require('../../services/outbound/outboundMetricsRenderer');
const logger = require('../../utils/logger');

const scrape = async (req, res, next) => {
  try {
    const body = await renderer.renderAccount({ accountId: req.accountId });
    res.setHeader('Content-Type', client.register.contentType || 'text/plain; version=0.0.4; charset=utf-8');
    return res.status(200).send(body);
  } catch (error) {
    logger.error('Outbound metrics scrape error', error);
    return next(error);
  }
};

module.exports = {
  scrape,
};
