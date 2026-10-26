const express = require('express');
const bounceReadController = require('../controllers/bounceReadController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, bounceReadController.offer);
browser.post('/report', apiRateLimiter.bounceReport, bounceReadController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('bounce'));
api.use(apiRateLimiter.bounceRead);
api.post('/', bounceReadController.report);

module.exports = {
  browser,
  api,
};
