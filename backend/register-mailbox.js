const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:3001/api';
const EMAIL = 'test@mailduck.io'; // Replace with your desired test email

async function registerMailbox() {
  try {
    console.log(`Registering mailbox: ${EMAIL}`);
    
    const response = await axios.post(`${API_URL}/mailbox/register`, {
      email: EMAIL
    });
    
    console.log('Registration successful:', response.data);
  } catch (error) {
    console.error('Error registering mailbox:', error.response?.data || error.message);
  }
}

registerMailbox(); 