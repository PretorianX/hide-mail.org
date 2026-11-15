const express = require('express');
const tlsReportController = require('../controllers/tlsReportController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, tlsReportController.offer);
browser.post('/report', apiRateLimiter.tlsReport, tlsReportController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('tls'));
api.use(apiRateLimiter.tlsRead);
api.post('/', tlsReportController.report);

module.exports = {
  browser,
  api,
};
