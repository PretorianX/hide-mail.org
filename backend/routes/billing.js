const express = require('express');
const billingController = require('../controllers/billingController');
const apiRateLimiter = require('../services/apiRateLimiter');

const router = express.Router();

// Returns a signed WayForPay Purchase payload. Frontend POSTs it to paymentUrl.
router.post('/checkout', apiRateLimiter.default, billingController.checkout);
router.get('/pricing', apiRateLimiter.default, billingController.listPlans);
router.get('/plans', apiRateLimiter.default, billingController.listPlans);
router.post('/license/validate', apiRateLimiter.licenseValidate, billingController.validateLicense);
// Same brute-force budget as validation: both take a license key as the only credential.
router.post('/license/api-key', apiRateLimiter.licenseValidate, billingController.issueApiKey);
router.get('/order/:orderReference', apiRateLimiter.orderLookup, billingController.getOrder);
router.post('/webhook', billingController.webhook);
// The customer return is mounted in server.js instead: it arrives as a cross-site form POST and
// has to be answered before the CORS check, which rejects WayForPay's Origin.

module.exports = router;
