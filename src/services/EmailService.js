import axios from 'axios';
import { faker } from '@faker-js/faker';

// Backend API URL
const API_URL = process.env.REACT_APP_API_URL || '/api';

console.log('API URL:', API_URL);

// Default mailbox lifetime in minutes
const DEFAULT_LIFETIME_MINUTES = 30;

// Local storage keys
const STORAGE_KEYS = {
  CURRENT_EMAIL: 'mailduck_current_email',
  EXPIRATION_TIME: 'mailduck_expiration_time'
};

class EmailService {
  static domains = [];
  static initialized = false;
  static currentEmail = null;
  static expirationTime = null;

  static async initialize() {
    if (this.initialized) return;
    
    try {
      // Load domains from the backend API
      const response = await axios.get(`${API_URL}/domains`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      this.domains = response.data.data;
      
      // Load saved email from localStorage if available
      this.loadFromStorage();
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing EmailService:', error);
      // Don't use fallback domains, throw the error
      throw new Error('Failed to load email domains. Please try again later.');
    }
  }

  static loadFromStorage() {
    try {
      const savedEmail = localStorage.getItem(STORAGE_KEYS.CURRENT_EMAIL);
      const savedExpiration = localStorage.getItem(STORAGE_KEYS.EXPIRATION_TIME);
      
      if (savedEmail && savedExpiration) {
        const expirationTime = new Date(savedExpiration);
        
        // Only restore if not expired
        if (expirationTime > new Date()) {
          this.currentEmail = savedEmail;
          this.expirationTime = expirationTime;
          console.log(`Restored email from storage: ${this.currentEmail}`);
        } else {
          console.log('Saved email was expired, not restoring');
          // Clear storage since it's expired
          this.clearStorage();
        }
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }

  static saveToStorage() {
    try {
      if (this.currentEmail && this.expirationTime) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_EMAIL, this.currentEmail);
        localStorage.setItem(STORAGE_KEYS.EXPIRATION_TIME, this.expirationTime.toISOString());
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  static clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_EMAIL);
      localStorage.removeItem(STORAGE_KEYS.EXPIRATION_TIME);
    } catch (error) {
      console.error('Error clearing localStorage:', error);
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

  static async generateEmail(domain = null) {
    try {
      // If we already have an email, deactivate it first
      if (this.currentEmail) {
        try {
          await this.deactivateCurrentEmail();
        } catch (error) {
          console.warn('Failed to deactivate previous email:', error);
        }
      }
      
      // Generate a new email address
      const localPart = this.generateRandomLocalPart();
      
      // Use the provided domain if specified and valid, otherwise use a random domain
      const emailDomain = domain && this.domains.includes(domain) 
        ? domain 
        : this.getRandomElement(this.domains);
      
      const newEmail = `${localPart}@${emailDomain}`;
      
      // Register the new email with the backend
      await axios.post(`${API_URL}/mailbox/register`, 
        { email: newEmail },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      
      // Set expiration time (30 minutes from now)
      this.expirationTime = new Date(Date.now() + DEFAULT_LIFETIME_MINUTES * 60 * 1000);
      
      // Save the new email
      this.currentEmail = newEmail;
      this.saveToStorage();
      
      return newEmail;
    } catch (error) {
      console.error('Error generating email:', error);
      throw error;
    }
  }

  static async deactivateCurrentEmail() {
    if (!this.currentEmail) return;
    
    try {
      // Call the backend to deactivate the mailbox
      await axios.post(`${API_URL}/mailbox/deactivate`, 
        { email: this.currentEmail },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      console.log(`Deactivated email: ${this.currentEmail}`);
      
      // Clear storage
      this.clearStorage();
      
      // Reset current email and expiration time
      this.currentEmail = null;
      this.expirationTime = null;
    } catch (error) {
      console.error('Error deactivating email:', error);
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
    
    return remaining > 0 ? remaining : 0;
  }

  static async refreshExpirationTime() {
    if (!this.currentEmail) return false;
    
    try {
      // Call the backend to refresh the mailbox
      const response = await axios.post(`${API_URL}/mailbox/refresh`, 
        { email: this.currentEmail },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      
      if (response.data.success) {
        // Update expiration time (30 minutes from now)
        this.expirationTime = new Date(Date.now() + DEFAULT_LIFETIME_MINUTES * 60 * 1000);
        this.saveToStorage();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error refreshing expiration time:', error);
      return false;
    }
  }

  static async getMessages(email) {
    try {
      const response = await axios.get(`${API_URL}/emails/${email}`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (response.data.success) {
        return response.data.data;
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }
  
  static async getMessageDetails(email, messageId) {
    try {
      // Get detailed message from the backend API
      const response = await axios.get(`${API_URL}/emails/${encodeURIComponent(email)}/${messageId}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching message details:', error);
      throw error;
    }
  }
  
  static async deleteMessage(email, messageId) {
    try {
      // Delete message via the backend API
      await axios.delete(`${API_URL}/emails/${encodeURIComponent(email)}/${messageId}`);
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }
  
  static async deleteAllMessages(email) {
    try {
      // Delete all messages for this email via the backend API
      await axios.delete(`${API_URL}/emails/${encodeURIComponent(email)}`);
      return true;
    } catch (error) {
      console.error('Error deleting all messages:', error);
      throw error;
    }
  }
}

export default EmailService; 