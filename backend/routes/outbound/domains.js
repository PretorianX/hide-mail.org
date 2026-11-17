const express = require('express');
const domainsController = require('../../controllers/outbound/domainsController');
const attachLicense = require('../../middleware/attachLicense');
const { requireOutboundLicense } = require('../../middleware/outboundAuth');

const router = express.Router();

router.use(attachLicense);
router.use(requireOutboundLicense);

router.post('/', domainsController.addDomain);
router.get('/', domainsController.listDomains);
router.post('/:domain/check', domainsController.checkDomain);
router.delete('/:domain', domainsController.removeDomain);

module.exports = router;
