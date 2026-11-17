const express = require('express');
const suppressionsController = require('../../controllers/outbound/suppressionsController');
const attachLicense = require('../../middleware/attachLicense');
const { requireOutboundLicense } = require('../../middleware/outboundAuth');

const router = express.Router();

router.use(attachLicense);
router.use(requireOutboundLicense);

router.get('/', suppressionsController.listSuppressions);
router.post('/', suppressionsController.addSuppression);
router.get('/export', suppressionsController.exportSuppressions);
router.delete('/:email', suppressionsController.removeSuppression);

module.exports = router;
