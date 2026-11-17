const express = require('express');
const activityController = require('../../controllers/outbound/activityController');
const attachLicense = require('../../middleware/attachLicense');
const { requireOutboundLicense } = require('../../middleware/outboundAuth');

const router = express.Router();

router.use(attachLicense);
router.use(requireOutboundLicense);

router.get('/', activityController.listActivity);

module.exports = router;
