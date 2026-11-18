const express = require('express');
const domainsController = require('../../controllers/outbound/domainsController');
const attachLicense = require('../../middleware/attachLicense');
const { requireOutboundLicense } = require('../../middleware/outboundAuth');
const apiRateLimiter = require('../../services/apiRateLimiter');

const router = express.Router();

router.use(attachLicense);
router.use(requireOutboundLicense);

router.post('/', apiRateLimiter.outboundDomainCreate, domainsController.addDomain);
router.get('/', domainsController.listDomains);
router.post('/:domain/check', apiRateLimiter.outboundDomainCheck, domainsController.checkDomain);
router.delete('/:domain', domainsController.removeDomain);

module.exports = router;
