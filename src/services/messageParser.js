/**
 * Message Parser utility functions for parsing email messages
 */

/**
 * Parses a multipart email message and extracts the text content
 * @param {string|Object} message - The email message (either raw string or object)
 * @returns {Object} - The parsed message with extracted content
 */
export const parseMultipartMessage = (message) => {
  // Handle both raw string messages and object messages
  if (typeof message === 'string') {
    return parseRawMultipartMessage(message);
  }

  if (!message || !message.content) {
    return { text: '', html: '', attachments: [] };
  }

  // Default values
  let textContent = '';
  let htmlContent = '';
  const attachments = [];

  // Check if the message has parts (multipart message)
  if (message.content.parts && Array.isArray(message.content.parts)) {
    // Process each part
    message.content.parts.forEach(part => {
      if (part.mimeType === 'text/plain') {
        textContent = part.body || '';
      } else if (part.mimeType === 'text/html') {
        htmlContent = part.body || '';
      } else if (part.filename) {
        // This is an attachment
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.size || 0,
          content: part.body || null
        });
      }
    });
  } else {
    // Single part message
    if (message.content.mimeType === 'text/plain') {
      textContent = message.content.body || '';
    } else if (message.content.mimeType === 'text/html') {
      htmlContent = message.content.body || '';
    }
  }

  return {
    text: textContent,
    html: htmlContent,
    attachments
  };
};

/**
 * Parses a raw multipart message string
 * @param {string} rawMessage - The raw multipart message string
 * @returns {Object} - The parsed message with extracted content
 */
function parseRawMultipartMessage(rawMessage) {
  if (!rawMessage) {
    return { text: '', html: '', attachments: [] };
  }

  // Default values
  let textContent = '';
  let htmlContent = '';
  const attachments = [];

  // Extract the boundary from the Content-Type header
  const boundaryMatch = rawMessage.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) {
    return { text: '', html: '', attachments: [] };
  }

  const boundary = boundaryMatch[1];
  const boundaryRegex = new RegExp(`--${boundary}(?:--|$)`, 'g');
  
  // Split the message into parts using the boundary
  const parts = rawMessage.split(`--${boundary}`);
  
  // Skip the first part (headers and preamble)
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    // Skip the closing boundary
    if (part.trim().startsWith('--')) {
      continue;
    }
    
    // Extract the Content-Type of this part
    const contentTypeMatch = part.match(/Content-Type:\s*([^;]+)/i);
    if (!contentTypeMatch) {
      continue;
    }
    
    const contentType = contentTypeMatch[1].trim().toLowerCase();
    
    // Find where the headers end and the content begins
    const headerEndIndex = part.indexOf('\r\n\r\n') !== -1 
      ? part.indexOf('\r\n\r\n') + 4 
      : part.indexOf('\n\n') + 2;
    
    if (headerEndIndex === -1) {
      continue;
    }
    
    const content = part.substring(headerEndIndex).trim();
    
    if (contentType === 'text/plain') {
      textContent = content;
    } else if (contentType === 'text/html') {
      htmlContent = content;
    } else if (contentType.startsWith('image/') || contentType.startsWith('application/')) {
      // This is an attachment, but we're not handling attachments in this simple parser
      // You could extract filename from Content-Disposition and add to attachments array
    }
  }
  
  return {
    text: textContent,
    html: htmlContent,
    attachments
  };
} 