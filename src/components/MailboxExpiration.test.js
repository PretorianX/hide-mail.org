import React from 'react';
import EmailService from '../services/EmailService';

// Don't mock EmailService for these tests
jest.unmock('../services/EmailService');

describe('Mailbox Expiration Handling', () => {
  beforeEach(() => {
    // Reset EmailService state
    EmailService.expirationTime = null;
  });

  test('isExpired returns true when expirationTime is null', () => {
    EmailService.expirationTime = null;
    expect(EmailService.isExpired()).toBe(true);
  });

  test('isExpired returns true when current time is after expirationTime', () => {
    // Set expiration time to 1 minute ago
    const pastTime = new Date();
    pastTime.setMinutes(pastTime.getMinutes() - 1);
    EmailService.expirationTime = pastTime;
    
    expect(EmailService.isExpired()).toBe(true);
  });

  test('isExpired returns false when current time is before expirationTime', () => {
    // Set expiration time to 1 minute in the future
    const futureTime = new Date();
    futureTime.setMinutes(futureTime.getMinutes() + 1);
    EmailService.expirationTime = futureTime;
    
    expect(EmailService.isExpired()).toBe(false);
  });
}); 