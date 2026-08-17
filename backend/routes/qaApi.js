const express = require('express');
const qaApiController = require('../controllers/qaApiController');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const apiRateLimiter = require('../services/apiRateLimiter');

const router = express.Router();

router.use(requireApiKey);
router.use(apiRateLimiter.default);

router.post('/mailboxes', qaApiController.createMailbox);
router.get('/mailboxes/:email/messages', qaApiController.listMessages);
router.get('/mailboxes/:email/messages/:id', qaApiController.getMessage);
router.put('/mailboxes/:email/webhook', qaApiController.setWebhook);
router.delete('/mailboxes/:email', qaApiController.deleteMailbox);

module.exports = router;
