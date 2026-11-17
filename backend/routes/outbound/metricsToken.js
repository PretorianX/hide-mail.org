const express = require('express');
const metricsTokenController = require('../../controllers/outbound/metricsTokenController');
const attachLicense = require('../../middleware/attachLicense');
const { requireOutboundLicense } = require('../../middleware/outboundAuth');

const router = express.Router();

router.use(attachLicense);
router.use(requireOutboundLicense);

router.post('/', metricsTokenController.rotateToken);
router.get('/', metricsTokenController.getTokenMeta);

module.exports = router;
