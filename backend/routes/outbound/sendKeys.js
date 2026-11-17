const express = require('express');
const sendKeysController = require('../../controllers/outbound/sendKeysController');
const attachLicense = require('../../middleware/attachLicense');
const { requireOutboundLicense } = require('../../middleware/outboundAuth');

const router = express.Router();

router.use(attachLicense);
router.use(requireOutboundLicense);

router.post('/', sendKeysController.createSendKey);
router.get('/', sendKeysController.listSendKeys);
router.delete('/:name', sendKeysController.revokeSendKey);

module.exports = router;
