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
  
  static setExpirationTime(minutes = DEFAULT_LIFETIME_MINUTES) {
    this.expirationTime = new Date(Date.now() + minutes * 60 * 1000);
    this.saveToStorage();
    return this.expirationTime;
  }

  static getRemainingTime() {
    if (!this.expirationTime) return 0;
    
    const now = new Date();
    const diff = this.expirationTime - now;
    
    return Math.max(0, diff);
  }

  static isExpired() {
    if (!this.expirationTime) return true;
    
    const now = new Date();
    return now >= this.expirationTime;
  }

  static async refreshExpirationTime() {
    try {
      if (!this.currentEmail) {
        console.warn('No current email to refresh');
        return false;
      }
      
      // Call the backend to refresh the mailbox lifetime
      await axios.post(`${API_URL}/mailbox/refresh`, 
        { email: this.currentEmail },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      
      // Set new expiration time (30 minutes from now)
      this.expirationTime = new Date(Date.now() + DEFAULT_LIFETIME_MINUTES * 60 * 1000);
      this.saveToStorage();
      
      console.log(`Refreshed expiration time for ${this.currentEmail}`);
      return true;
    } catch (error) {
      console.error('Error refreshing expiration time:', error);
      // If the API call fails, still extend the time locally
      this.expirationTime = new Date(Date.now() + DEFAULT_LIFETIME_MINUTES * 60 * 1000);
      this.saveToStorage();
      return true;
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
      console.log(`Getting message details for email: ${email}, messageId: ${messageId}`);
      
      // Get detailed message from the backend API
      const response = await axios.get(`${API_URL}/emails/${encodeURIComponent(email)}/${messageId}`);
      console.log('API response status:', response.status);
      console.log('API response data structure:', Object.keys(response.data));
      
      // Import the message parser dynamically to avoid circular dependencies
      const { parseMultipartMessage } = await import('./messageParser');
      
      // Parse the message to extract HTML and text content
      const messageData = response.data.data;
      console.log('Message data structure:', Object.keys(messageData));
      
      // Check if the message has a raw property
      if (messageData.raw) {
        console.log('Raw message found, length:', messageData.raw.length);
        console.log('Raw message preview:', messageData.raw.substring(0, 500));
      } else {
        console.log('No raw message found in the response');
      }
      
      // Check if the message has a body property
      if (messageData.body) {
        console.log('Body found, length:', messageData.body.length);
        console.log('Body preview:', messageData.body.substring(0, 500));
        
        // Check if the body contains HTML tags
        const hasHtmlTags = /<html|<body|<div|<p|<table|<a|<img|<br|<h[1-6]|<!DOCTYPE html/i.test(messageData.body);
        console.log('Body contains HTML tags:', hasHtmlTags);
      }
      
      // If the message already has parsed content, use it
      if (messageData.html !== undefined || messageData.text !== undefined) {
        console.log('Message already has parsed content:');
        console.log('- HTML content:', messageData.html ? 'Yes' : 'No', messageData.html ? `(${messageData.html.length} chars)` : '');
        console.log('- Text content:', messageData.text ? 'Yes' : 'No', messageData.text ? `(${messageData.text.length} chars)` : '');
        return messageData;
      }
      
      // Otherwise, parse the raw message if available
      if (messageData.raw) {
        console.log('Parsing raw message');
        const parsedContent = parseMultipartMessage(messageData.raw);
        console.log('Parsed content result:');
        console.log('- HTML content:', parsedContent.html ? 'Yes' : 'No', parsedContent.html ? `(${parsedContent.html.length} chars)` : '');
        console.log('- Text content:', parsedContent.text ? 'Yes' : 'No', parsedContent.text ? `(${parsedContent.text.length} chars)` : '');
        
        // Merge the parsed content with the original message data
        const result = {
          ...messageData,
          html: parsedContent.html || '',
          text: parsedContent.text || '',
          attachments: parsedContent.attachments || []
        };
        
        console.log('Final result after parsing raw message:');
        console.log('- HTML content length:', result.html.length);
        console.log('- Text content length:', result.text.length);
        
        return result;
      }
      
      // If no raw message is available but we have a body, try to determine if it's HTML
      if (messageData.body) {
        // Check if the body looks like HTML
        const looksLikeHtml = /<html|<body|<div|<p|<table|<a|<img|<br|<h[1-6]|<!DOCTYPE html/i.test(messageData.body);
        
        // Check if it's a forwarded message
        const isForwarded = messageData.body.includes('---------- Forwarded message ---------') || 
                           messageData.body.includes('Begin forwarded message:');
        console.log('Message appears to be forwarded:', isForwarded);
        
        if (looksLikeHtml) {
          console.log('Body appears to be HTML content');
          const result = {
            ...messageData,
            html: messageData.body,
            text: ''
          };
          
          console.log('Final result using body as HTML:');
          console.log('- HTML content length:', result.html.length);
          
          return result;
        }
        
        // If the body contains Content-Type headers, it might be a raw email
        if (messageData.body.includes('Content-Type:')) {
          console.log('Body appears to be a raw email, parsing it');
          const parsedContent = parseMultipartMessage(messageData.body);
          
          const result = {
            ...messageData,
            html: parsedContent.html || '',
            text: parsedContent.text || messageData.body,
            attachments: parsedContent.attachments || []
          };
          
          console.log('Final result after parsing body as raw email:');
          console.log('- HTML content length:', result.html.length);
          console.log('- Text content length:', result.text.length);
          
          return result;
        }
        
        // Special handling for forwarded messages
        if (isForwarded) {
          console.log('Handling forwarded message');
          
          // Try to extract the original message content
          const forwardedContent = messageData.body;
          
          // For forwarded messages, we'll create a simple HTML representation
          const htmlContent = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
              <div style="white-space: pre-wrap;">${forwardedContent.replace(/\n/g, '<br>')}</div>
            </div>
          `;
          
          const result = {
            ...messageData,
            html: htmlContent,
            text: forwardedContent
          };
          
          console.log('Created HTML representation for forwarded message');
          console.log('- HTML content length:', result.html.length);
          
          return result;
        }
      }
      
      // If no HTML content could be extracted, use the body as text
      console.log('Using body as text content');
      const result = {
        ...messageData,
        text: messageData.body || '',
        html: ''
      };
      
      console.log('Final result using body as text:');
      console.log('- HTML content length:', result.html.length);
      console.log('- Text content length:', result.text.length);
      
      return result;
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