const express = require('express');
const complaintReadController = require('../controllers/complaintReadController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, complaintReadController.offer);
browser.post('/report', apiRateLimiter.complaintReport, complaintReadController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('complaint'));
api.use(apiRateLimiter.complaintRead);
api.post('/', complaintReadController.report);

module.exports = {
  browser,
  api,
};
