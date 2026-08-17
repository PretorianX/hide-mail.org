const express = require('express');
const billingController = require('../controllers/billingController');
const apiRateLimiter = require('../services/apiRateLimiter');

const router = express.Router();

// Returns a signed WayForPay Purchase payload. Frontend POSTs it to paymentUrl.
router.post('/checkout', apiRateLimiter.default, billingController.checkout);
router.get('/pricing', apiRateLimiter.default, billingController.listPlans);
router.get('/plans', apiRateLimiter.default, billingController.listPlans);
router.post('/license/validate', apiRateLimiter.licenseValidate, billingController.validateLicense);
router.get('/order/:orderReference', apiRateLimiter.orderLookup, billingController.getOrder);
router.post('/webhook', billingController.webhook);

module.exports = router;
