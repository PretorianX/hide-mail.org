import { parseRawMessage, parseMultipartMessage } from './messageParser';

describe('parseMultipartMessage', () => {
  test('should handle forwarded messages', () => {
    // Mock a forwarded message
    const forwardedMessage = `From: sender@example.com
To: recipient@example.com
Subject: Fwd: Original Subject
Date: Mon, 11 Mar 2025 10:00:00 +0000

---------- Forwarded message ---------
From: original@example.com
Date: Mon, 11 Mar 2025 09:00:00 +0000
Subject: Original Subject
To: sender@example.com

This is the content of the forwarded message.
It should be properly displayed.`;

    // Parse the message
    const result = parseMultipartMessage(forwardedMessage);
    
    // Verify the result
    expect(result).toBeDefined();
    expect(result.text).toContain('This is the content of the forwarded message.');
    expect(result.html).toBeDefined();
    expect(result.html).toContain('<div style="white-space: pre-wrap;">');
    expect(result.html).toContain('This is the content of the forwarded message.<br>It should be properly displayed.');
  });
  
  test('should create HTML from plain text when no HTML is found', () => {
    // Mock a plain text message
    const plainTextMessage = `From: sender@example.com
To: recipient@example.com
Subject: Plain Text Message
Date: Mon, 11 Mar 2025 10:00:00 +0000
Content-Type: text/plain

This is a plain text message.
It should be converted to HTML.`;

    // Parse the message
    const result = parseMultipartMessage(plainTextMessage);
    
    // Verify the result
    expect(result).toBeDefined();
    expect(result.text).toContain('This is a plain text message.');
    expect(result.html).toBeDefined();
    expect(result.html).toContain('<div style="white-space: pre-wrap;">');
    expect(result.html).toContain('This is a plain text message.<br>It should be converted to HTML.');
  });
}); 