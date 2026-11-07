const express = require('express');
const oneClickController = require('../controllers/oneClickController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, oneClickController.offer);
browser.post('/report', apiRateLimiter.oneClickReport, oneClickController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('oneclick'));
api.use(apiRateLimiter.oneClickRead);
api.post('/', oneClickController.report);

module.exports = {
  browser,
  api,
};
