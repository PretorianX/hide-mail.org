const express = require('express');
const senderCheckController = require('../controllers/senderCheckController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, senderCheckController.offer);
browser.post('/report', apiRateLimiter.senderReport, senderCheckController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('sender'));
api.use(apiRateLimiter.senderCheck);
api.post('/', senderCheckController.report);

module.exports = {
  browser,
  api,
};
