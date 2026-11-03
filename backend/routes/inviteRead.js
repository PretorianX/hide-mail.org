const express = require('express');
const inviteReadController = require('../controllers/inviteReadController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, inviteReadController.offer);
browser.post('/report', apiRateLimiter.inviteReport, inviteReadController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('invite'));
api.use(apiRateLimiter.inviteRead);
api.post('/', inviteReadController.report);

module.exports = {
  browser,
  api,
};
