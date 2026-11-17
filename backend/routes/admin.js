const express = require('express');
const adminController = require('../controllers/adminController');
const requireAdminSession = require('../middleware/requireAdminSession');
const apiRateLimiter = require('../services/apiRateLimiter');

const router = express.Router();

router.post('/login', apiRateLimiter.default, adminController.login);
router.post('/logout', apiRateLimiter.default, adminController.logout);

router.get('/me', apiRateLimiter.default, requireAdminSession, adminController.me);
router.get('/license-types', apiRateLimiter.default, requireAdminSession, adminController.listTypes);
router.get('/licenses', apiRateLimiter.default, requireAdminSession, adminController.listLicenses);
router.post('/licenses', apiRateLimiter.default, requireAdminSession, adminController.createLicense);
router.delete(
  '/licenses/:id',
  apiRateLimiter.default,
  requireAdminSession,
  adminController.deleteLicense
);

module.exports = router;
