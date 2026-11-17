const express = require('express');
const accountController = require('../../controllers/outbound/accountController');
const attachLicense = require('../../middleware/attachLicense');
const { requireOutboundLicense } = require('../../middleware/outboundAuth');

const router = express.Router();

router.use(attachLicense);
router.use(requireOutboundLicense);

router.get('/summary', accountController.getSummary);

module.exports = router;
