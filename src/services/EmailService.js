import axios from 'axios';

// Replace with your actual API URL
const API_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';

class EmailService {
  static async generateEmail() {
    try {
      // This is a placeholder. Replace with your actual API endpoint
      // const response = await axios.get(`${API_URL}/generate-email`);
      // return response.data.email;
      
      // For demo purposes, return a duck-themed fake email
      const duckNames = ['quacky', 'ducky', 'mallard', 'feathers', 'waddles', 'bill', 'drake', 'duckling'];
      const randomDuck = duckNames[Math.floor(Math.random() * duckNames.length)];
      const randomNum = Math.floor(Math.random() * 10000);
      return `${randomDuck}${randomNum}@mailduck.io`;
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
      
      // For demo purposes, return duck-themed fake messages
      return [
        {
          id: 1,
          from: 'welcome@mailduck.io',
          subject: 'Welcome to Mail Duck!',
          preview: 'Thank you for using our service! Your temporary duck mail is ready to use...',
          date: new Date().toISOString()
        },
        {
          id: 2,
          from: 'newsletter@quacktech.com',
          subject: 'Weekly Tech Quacks',
          preview: 'This week in tech: New gadgets for ducks, waterproof smartphones, and more...',
          date: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 3,
          from: 'no-reply@pondside.com',
          subject: 'Your Pondside Account',
          preview: 'Your account has been created successfully. Please verify your email...',
          date: new Date(Date.now() - 7200000).toISOString()
        }
      ];
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }
}

export default EmailService; 