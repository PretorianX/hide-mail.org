const express = require('express');
const messagesController = require('../../controllers/outbound/messagesController');
const { requireSendKey } = require('../../middleware/outboundAuth');

const router = express.Router();

router.use(requireSendKey);

router.post('/', messagesController.createMessage);
router.get('/:id', messagesController.getMessage);

module.exports = router;
