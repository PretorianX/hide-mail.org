/**
 * Message Parser utility functions for parsing email messages
 */

/**
 * Parses a multipart email message and extracts the text content
 * @param {string|Object} message - The email message (either raw string or object)
 * @returns {Object} - The parsed message with extracted content
 */
export const parseMultipartMessage = (message) => {
  console.log('parseMultipartMessage called with type:', typeof message);
  
  // Handle both raw string messages and object messages
  if (typeof message === 'string') {
    console.log('Parsing raw string message, length:', message.length);
    return parseRawMultipartMessage(message);
  }

  if (!message || !message.content) {
    console.log('No message or content found');
    return { text: '', html: '', attachments: [] };
  }

  // Default values
  let textContent = '';
  let htmlContent = '';
  const attachments = [];

  // Check if the message has parts (multipart message)
  if (message.content.parts && Array.isArray(message.content.parts)) {
    console.log('Processing multipart message with', message.content.parts.length, 'parts');
    
    // Process each part
    message.content.parts.forEach((part, index) => {
      console.log(`Part ${index} has mimeType:`, part.mimeType);
      
      if (part.mimeType === 'text/plain') {
        textContent = part.body || '';
        console.log('Found text/plain part, length:', textContent.length);
      } else if (part.mimeType === 'text/html') {
        htmlContent = part.body || '';
        console.log('Found text/html part, length:', htmlContent.length);
      } else if (part.filename) {
        // This is an attachment
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.size || 0,
          content: part.body || null
        });
        console.log('Found attachment:', part.filename);
      }
    });
  } else {
    console.log('Processing single part message with mimeType:', message.content.mimeType);
    
    // Single part message
    if (message.content.mimeType === 'text/plain') {
      textContent = message.content.body || '';
      console.log('Found text/plain content, length:', textContent.length);
    } else if (message.content.mimeType === 'text/html') {
      htmlContent = message.content.body || '';
      console.log('Found text/html content, length:', htmlContent.length);
    }
  }

  console.log('Parsed message result - HTML length:', htmlContent.length, 'Text length:', textContent.length);
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
    console.log('No raw message provided');
    return { text: '', html: '', attachments: [] };
  }

  // Default values
  let textContent = '';
  let htmlContent = '';
  const attachments = [];

  // Check if the message contains HTML directly
  const hasHtmlTags = /<html|<body|<div|<p|<table|<a|<img|<br|<h[1-6]|<!DOCTYPE html/i.test(rawMessage);
  
  // Try to determine if this is a multipart message
  const contentTypeHeader = extractHeader(rawMessage, 'Content-Type');
  console.log('Content-Type header:', contentTypeHeader);
  
  // If this is a simple HTML message (not multipart)
  if (hasHtmlTags && (!contentTypeHeader || !contentTypeHeader.includes('multipart'))) {
    console.log('Found HTML tags in the message');
    
    // If we have a Content-Type header for HTML, extract the body
    if (contentTypeHeader && contentTypeHeader.includes('text/html')) {
      console.log('Found simple HTML message with Content-Type header');
      htmlContent = extractMessageBody(rawMessage);
    } else {
      // Otherwise, try to extract HTML content from the raw message
      console.log('Extracting HTML content from raw message');
      
      // Try to find HTML content between <html> and </html> tags
      const htmlMatch = rawMessage.match(/<html[^>]*>([\s\S]*?)<\/html>/i);
      if (htmlMatch) {
        console.log('Found HTML content between <html> tags');
        htmlContent = `<html>${htmlMatch[1]}</html>`;
      } else {
        // If no <html> tags, try to find content between <body> and </body> tags
        const bodyMatch = rawMessage.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          console.log('Found HTML content between <body> tags');
          htmlContent = `<body>${bodyMatch[1]}</body>`;
        } else {
          // If no specific HTML structure found, use the whole message as HTML
          // if it contains HTML tags
          console.log('Using whole message as HTML');
          htmlContent = rawMessage;
        }
      }
    }
    
    console.log('Extracted HTML content length:', htmlContent.length);
    return { text: '', html: htmlContent, attachments: [] };
  }
  
  // If this is a simple text message (not multipart)
  if (contentTypeHeader && contentTypeHeader.includes('text/plain') && !contentTypeHeader.includes('multipart')) {
    console.log('Found simple text message');
    textContent = extractMessageBody(rawMessage);
    console.log('Extracted text content length:', textContent.length);
    return { text: textContent, html: '', attachments: [] };
  }

  // Extract the boundary from the Content-Type header
  const boundaryMatch = rawMessage.match(/boundary="([^"]+)"|boundary=([^;]+)/i);
  if (!boundaryMatch) {
    console.log('No boundary found in multipart message');
    
    // If the message contains HTML tags but no boundary, try to extract HTML
    if (hasHtmlTags) {
      console.log('Message contains HTML tags, extracting as HTML');
      return { text: '', html: rawMessage, attachments: [] };
    }
    
    // If no boundary found, try to extract the body as plain text
    textContent = extractMessageBody(rawMessage);
    console.log('Extracted text content as fallback, length:', textContent.length);
    return { text: textContent, html: '', attachments: [] };
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  console.log('Found boundary:', boundary);
  
  // Split the message into parts using the boundary
  const parts = rawMessage.split(`--${boundary}`);
  console.log('Split message into', parts.length, 'parts');
  
  // Skip the first part (headers and preamble)
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    // Skip the closing boundary
    if (part.trim().startsWith('--')) {
      console.log('Skipping closing boundary part');
      continue;
    }
    
    // Extract the Content-Type of this part
    const contentTypeMatch = part.match(/Content-Type:\s*([^;]+)/i);
    if (!contentTypeMatch) {
      console.log(`Part ${i} has no Content-Type, skipping`);
      continue;
    }
    
    const contentType = contentTypeMatch[1].trim().toLowerCase();
    console.log(`Part ${i} has Content-Type:`, contentType);
    
    // Find where the headers end and the content begins
    const headerEndIndex = part.indexOf('\r\n\r\n') !== -1 
      ? part.indexOf('\r\n\r\n') + 4 
      : part.indexOf('\n\n') + 2;
    
    if (headerEndIndex === -1 || headerEndIndex >= part.length) {
      console.log(`Part ${i} has no header end or empty content, skipping`);
      continue;
    }
    
    const content = part.substring(headerEndIndex).trim();
    console.log(`Part ${i} content length:`, content.length);
    
    if (contentType === 'text/plain') {
      textContent = content;
      console.log('Found text/plain part, content length:', textContent.length);
    } else if (contentType === 'text/html') {
      htmlContent = content;
      console.log('Found text/html part, content length:', htmlContent.length);
    } else if (contentType.startsWith('image/') || contentType.startsWith('application/')) {
      // Extract filename from Content-Disposition if available
      const filenameMatch = part.match(/filename="([^"]+)"/i);
      const filename = filenameMatch ? filenameMatch[1] : `attachment-${i}.${getExtensionFromMimeType(contentType)}`;
      
      attachments.push({
        filename,
        mimeType: contentType,
        size: content.length,
        content: null // We don't handle binary content here
      });
      console.log('Found attachment:', filename);
    }
  }
  
  // If we didn't find any HTML content but the message contains HTML tags,
  // try to extract HTML from the raw message
  if (!htmlContent && hasHtmlTags) {
    console.log('No HTML content found in parts, but message contains HTML tags');
    
    // Try to find HTML content between <html> and </html> tags
    const htmlMatch = rawMessage.match(/<html[^>]*>([\s\S]*?)<\/html>/i);
    if (htmlMatch) {
      console.log('Found HTML content between <html> tags');
      htmlContent = `<html>${htmlMatch[1]}</html>`;
    } else {
      // If no <html> tags, try to find content between <body> and </body> tags
      const bodyMatch = rawMessage.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        console.log('Found HTML content between <body> tags');
        htmlContent = `<body>${bodyMatch[1]}</body>`;
      }
    }
  }
  
  console.log('Raw message parsing result - HTML length:', htmlContent.length, 'Text length:', textContent.length);
  return {
    text: textContent,
    html: htmlContent,
    attachments
  };
}

/**
 * Helper function to extract a specific header from a raw message
 * @param {string} rawMessage - The raw message
 * @param {string} headerName - The name of the header to extract
 * @returns {string|null} - The header value or null if not found
 */
function extractHeader(rawMessage, headerName) {
  const headerRegex = new RegExp(`^${headerName}:\\s*(.+?)$`, 'im');
  const match = rawMessage.match(headerRegex);
  return match ? match[1].trim() : null;
}

/**
 * Helper function to extract the message body from a raw message
 * @param {string} rawMessage - The raw message
 * @returns {string} - The message body
 */
function extractMessageBody(rawMessage) {
  // Find the end of headers (blank line)
  const headerEndIndex = rawMessage.indexOf('\r\n\r\n') !== -1 
    ? rawMessage.indexOf('\r\n\r\n') + 4 
    : rawMessage.indexOf('\n\n') + 2;
  
  if (headerEndIndex === -1 || headerEndIndex >= rawMessage.length) {
    return '';
  }
  
  return rawMessage.substring(headerEndIndex).trim();
}

/**
 * Helper function to get a file extension from a MIME type
 * @param {string} mimeType - The MIME type
 * @returns {string} - The file extension
 */
function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
  };
  
  return mimeToExt[mimeType] || 'bin';
} 