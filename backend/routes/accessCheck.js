const express = require('express');
const accessCheckController = require('../controllers/accessCheckController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, accessCheckController.offer);
browser.post('/report', apiRateLimiter.accessReport, accessCheckController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('access'));
api.use(apiRateLimiter.accessRead);
api.post('/', accessCheckController.report);

module.exports = {
  browser,
  api,
};
