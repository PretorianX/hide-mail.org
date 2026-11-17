const express = require('express');

const domains = require('./domains');
const sendKeys = require('./sendKeys');
const messages = require('./messages');
const account = require('./account');
const suppressions = require('./suppressions');
const metricsToken = require('./metricsToken');
const metrics = require('./metrics');
const activity = require('./activity');

const router = express.Router();

// Metrics scrape uses hm_metrics_... only — mount before licence-gated paths.
router.use('/metrics', metrics);
router.use('/metrics-token', metricsToken);
router.use('/domains', domains);
router.use('/send-keys', sendKeys);
router.use('/messages', messages);
router.use('/account', account);
router.use('/suppressions', suppressions);
router.use('/activity', activity);

module.exports = router;
