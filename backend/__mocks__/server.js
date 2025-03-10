// Mock implementation of server.js
const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Mock routes
app.get('/api/emails/:email', (req, res) => {
  const { email } = req.params;
  
  // Basic email validation
  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  
  // This will be mocked in tests
  const emailService = require('../services/emailService');
  emailService.getEmails(email)
    .then(emails => {
      res.json({ success: true, data: emails });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

// Export for testing
module.exports = { app }; 