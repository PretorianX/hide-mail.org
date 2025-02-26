import axios from 'axios';
import { faker } from '@faker-js/faker';

// Replace with your actual API URL
const API_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';

// Default mailbox lifetime in minutes
const DEFAULT_LIFETIME_MINUTES = 30;

class EmailService {
  static domains = [];
  static initialized = false;
  static currentEmail = null;
  static expirationTime = null;

  static async initialize() {
    if (this.initialized) return;
    
    try {
      // Load domains from the mounted JSON file
      const domainsResponse = await fetch('/config/domains.json');
      const domainsData = await domainsResponse.json();
      this.domains = domainsData.domains;
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
    // Use different formats for local part following email best practices
    const formats = [
      // firstName.lastName (most common format)
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${firstName}.${lastName}`;
      },
      // firstNameLastName (no delimiter)
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${firstName}${lastName}`;
      },
      // first letter of first name + lastName
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${firstName.charAt(0)}${lastName}`;
      },
      // firstName.lastName + 2 digit year
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const year = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return `${firstName}.${lastName}${year}`;
      },
      // firstName.lastName + 4 digit year
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const year = Math.floor(Math.random() * (2023 - 1950) + 1950);
        return `${firstName}.${lastName}${year}`;
      },
      // firstName_lastName (underscore delimiter)
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${firstName}_${lastName}`;
      },
      // lastName.firstName
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${lastName}.${firstName}`;
      },
      // firstName-lastName (hyphen delimiter)
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${firstName}-${lastName}`;
      },
      // firstName + random number
      () => {
        const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
        const randomNum = Math.floor(Math.random() * 1000);
        return `${firstName}${randomNum}`;
      }
    ];
    
    // Generate the local part
    let localPart = this.getRandomElement(formats)();
    
    // Ensure the local part doesn't start or end with a period
    localPart = localPart.replace(/^\.|\.$/, '');
    
    // Ensure there are no consecutive periods
    localPart = localPart.replace(/\.{2,}/g, '.');
    
    // Ensure the local part is not too long (max 64 characters according to RFC)
    if (localPart.length > 64) {
      localPart = localPart.substring(0, 64);
    }
    
    return localPart;
  }

  static async generateEmail(selectedDomain = null) {
    await this.initialize();
    
    try {
      // This is a placeholder. Replace with your actual API endpoint
      // const response = await axios.get(`${API_URL}/generate-email`);
      // return response.data.email;
      
      const localPart = this.generateRandomLocalPart();
      const domain = selectedDomain || this.getRandomElement(this.domains);
      
      const email = `${localPart}@${domain}`;
      
      // Set expiration time to 30 minutes from now
      this.currentEmail = email;
      this.expirationTime = new Date(Date.now() + DEFAULT_LIFETIME_MINUTES * 60 * 1000);
      
      return email;
    } catch (error) {
      console.error('Error generating email:', error);
      throw error;
    }
  }

  static async getAvailableDomains() {
    await this.initialize();
    return this.domains;
  }

  static getExpirationTime() {
    return this.expirationTime;
  }

  static getRemainingTime() {
    if (!this.expirationTime) return 0;
    
    const now = new Date();
    const remaining = this.expirationTime - now;
    
    // Return remaining time in milliseconds, or 0 if expired
    return Math.max(0, remaining);
  }

  static refreshExpirationTime() {
    if (!this.currentEmail) return false;
    
    // Extend expiration time by another 30 minutes from now
    this.expirationTime = new Date(Date.now() + DEFAULT_LIFETIME_MINUTES * 60 * 1000);
    return true;
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