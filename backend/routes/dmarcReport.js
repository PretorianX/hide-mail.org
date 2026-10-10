const express = require('express');
const dmarcReportController = require('../controllers/dmarcReportController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, dmarcReportController.offer);
browser.post('/read', apiRateLimiter.reportsRead, dmarcReportController.read);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('reports'));
api.use(apiRateLimiter.dmarcReports);
api.post('/', dmarcReportController.read);

module.exports = {
  browser,
  api,
};
