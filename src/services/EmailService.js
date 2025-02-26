import axios from 'axios';

// Replace with your actual API URL
const API_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';

class EmailService {
  static domains = [];
  static firstNames = [];
  static lastNames = [];
  static initialized = false;

  static async initialize() {
    if (this.initialized) return;
    
    try {
      // Load domains from the mounted JSON file
      const domainsResponse = await fetch('/config/domains.json');
      const domainsData = await domainsResponse.json();
      this.domains = domainsData.domains;
      
      // Load names from a public API or use a predefined list
      this.firstNames = [
        'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
        'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
        'alex', 'jordan', 'taylor', 'casey', 'riley', 'jamie', 'jessie', 'peyton', 'quinn', 'reese'
      ];
      
      this.lastNames = [
        'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis', 'rodriguez', 'martinez',
        'hernandez', 'lopez', 'gonzalez', 'wilson', 'anderson', 'thomas', 'taylor', 'moore', 'jackson', 'martin',
        'lee', 'perez', 'thompson', 'white', 'harris', 'sanchez', 'clark', 'ramirez', 'lewis', 'robinson'
      ];
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing EmailService:', error);
      // Fallback domains if file loading fails
      this.domains = ['mailduck.io', 'mail-duck.com', 'duckmail.org'];
      this.initialized = true;
    }
  }

  static getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  static generateRandomLocalPart() {
    const firstName = this.getRandomElement(this.firstNames);
    const lastName = this.getRandomElement(this.lastNames);
    
    // Different formats for local part
    const formats = [
      // name.surname
      () => `${firstName}.${lastName}`,
      // namesurname (no delimiter)
      () => `${firstName}${lastName}`,
      // first letter of first name + surname
      () => `${firstName.charAt(0)}${lastName}`,
      // name.surname + 2 digit year
      () => `${firstName}.${lastName}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      // name.surname + 4 digit year
      () => `${firstName}.${lastName}${Math.floor(Math.random() * (2023 - 1950) + 1950)}`,
      // name_surname
      () => `${firstName}_${lastName}`,
      // surname.name
      () => `${lastName}.${firstName}`,
      // name + random number
      () => `${firstName}${Math.floor(Math.random() * 1000)}`
    ];
    
    return this.getRandomElement(formats)();
  }

  static async generateEmail(selectedDomain = null) {
    await this.initialize();
    
    try {
      // This is a placeholder. Replace with your actual API endpoint
      // const response = await axios.get(`${API_URL}/generate-email`);
      // return response.data.email;
      
      const localPart = this.generateRandomLocalPart();
      const domain = selectedDomain || this.getRandomElement(this.domains);
      
      return `${localPart}@${domain}`;
    } catch (error) {
      console.error('Error generating email:', error);
      throw error;
    }
  }

  static async getAvailableDomains() {
    await this.initialize();
    return this.domains;
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
          preview: 'Thank you for using our service! Your temporary mail is ready to use...',
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