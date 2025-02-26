// This is a mock service - in a real app, these functions would call your backend API

// Generate a random string for the email username
const generateRandomString = (length = 8) => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Mock function to generate an email address
export const generateEmail = async (domain) => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const username = generateRandomString();
  return `${username}@${domain}`;
};

// Mock function to extend email lifetime
export const extendEmailLifetime = async (email) => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // In a real app, this would update the expiry time in your backend
  return true;
};

// Mock function to fetch emails
export const fetchEmails = async (email) => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Generate some mock emails
  const mockEmails = [
    {
      id: '1',
      subject: 'Welcome to TempMail',
      from: 'support@tempmail.com',
      timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
      body: '<p>Thank you for using our temporary email service!</p><p>This email will expire in 30 minutes, but you can extend it if needed.</p>',
      unread: false
    },
    {
      id: '2',
      subject: 'Your account verification',
      from: 'noreply@example.com',
      timestamp: Date.now() - 1000 * 60 * 2, // 2 minutes ago
      body: '<p>Hello,</p><p>Your verification code is: <strong>123456</strong></p><p>This code will expire in 10 minutes.</p>',
      unread: true
    },
    {
      id: '3',
      subject: 'Special offer just for you!',
      from: 'marketing@example.org',
      timestamp: Date.now() - 1000 * 30, // 30 seconds ago
      body: '<p>Dear user,</p><p>We have a special offer just for you! Click <a href="#">here</a> to learn more.</p><p>Regards,<br>Marketing Team</p>',
      unread: true
    }
  ];
  
  return mockEmails;
}; 