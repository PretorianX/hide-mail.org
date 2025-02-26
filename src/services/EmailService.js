import axios from 'axios';

// Replace with your actual API URL
const API_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';

class EmailService {
  static async generateEmail() {
    try {
      // This is a placeholder. Replace with your actual API endpoint
      // const response = await axios.get(`${API_URL}/generate-email`);
      // return response.data.email;
      
      // For demo purposes, return a fake email
      return `user${Math.floor(Math.random() * 10000)}@tempmail.example.com`;
    } catch (error) {
      console.error('Error generating email:', error);
      throw error;
    }
  }

  static async getMessages(email) {
    try {
      // This is a placeholder. Replace with your actual API endpoint
      // const response = await axios.get(`${API_URL}/messages?email=${email}`);
      // return response.data.messages;
      
      // For demo purposes, return fake messages
      return [
        {
          id: 1,
          from: 'service@example.com',
          subject: 'Welcome to our service',
          preview: 'Thank you for signing up to our service...',
          date: new Date().toISOString()
        },
        {
          id: 2,
          from: 'newsletter@tech.com',
          subject: 'Weekly Tech Newsletter',
          preview: 'This week in tech: New releases and updates...',
          date: new Date(Date.now() - 3600000).toISOString()
        }
      ];
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }
}

export default EmailService; 