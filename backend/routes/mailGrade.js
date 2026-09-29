const express = require('express');
const mailGradeController = require('../controllers/mailGradeController');
const apiRateLimiter = require('../services/apiRateLimiter');
const { requireApiKey, requireLicenseType } = require('../middleware/apiKeyAuth');

const browser = express.Router();
browser.get('/offer', apiRateLimiter.default, mailGradeController.offer);
browser.post('/report', apiRateLimiter.gradeReport, mailGradeController.report);

const api = express.Router();
api.use(requireApiKey);
api.use(requireLicenseType('grade'));
api.use(apiRateLimiter.mailGrade);
api.post('/', mailGradeController.report);

module.exports = {
  browser,
  api,
};
