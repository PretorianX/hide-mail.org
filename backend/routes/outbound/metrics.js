const express = require('express');
const metricsScrapeController = require('../../controllers/outbound/metricsScrapeController');
const { requireMetricsToken } = require('../../middleware/outboundAuth');

const router = express.Router();

router.get('/', requireMetricsToken, metricsScrapeController.scrape);

module.exports = router;
