const express = require('express');

const domains = require('./domains');
const sendKeys = require('./sendKeys');
const messages = require('./messages');
const account = require('./account');
const suppressions = require('./suppressions');

const router = express.Router();

router.use('/domains', domains);
router.use('/send-keys', sendKeys);
router.use('/messages', messages);
router.use('/account', account);
router.use('/suppressions', suppressions);

module.exports = router;
