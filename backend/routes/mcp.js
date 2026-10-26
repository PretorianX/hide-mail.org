const express = require('express');
const mcpController = require('../controllers/mcpController');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const apiRateLimiter = require('../services/apiRateLimiter');

const router = express.Router();

router.get('/', apiRateLimiter.default, requireApiKey, mcpController.handleGet);
router.post('/', apiRateLimiter.default, requireApiKey, mcpController.handlePost);

module.exports = router;
