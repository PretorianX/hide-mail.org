const express = require('express');
const emailController = require('../controllers/emailController');

const router = express.Router();

// Email routes
router.get('/emails/:email', emailController.getEmails);
router.get('/emails/:email/:id', emailController.getEmailById);
router.delete('/emails/:email/:id', emailController.deleteEmail);
router.delete('/emails/:email', emailController.deleteAllEmails);

// Domain routes
router.get('/domains', emailController.getDomains);

// Mailbox routes
router.post('/mailbox/register', emailController.registerMailbox);
router.post('/mailbox/refresh', emailController.refreshMailbox);
router.post('/mailbox/deactivate', emailController.deactivateMailbox);

module.exports = router; 