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

  // Try to determine if this is a multipart message
  const contentTypeHeader = extractHeader(rawMessage, 'Content-Type');
  
  // If this is a simple HTML or text message (not multipart)
  if (contentTypeHeader && !contentTypeHeader.includes('multipart')) {
    if (contentTypeHeader.includes('text/html')) {
      // Extract HTML content
      htmlContent = extractMessageBody(rawMessage);
      return { text: '', html: htmlContent, attachments: [] };
    } else if (contentTypeHeader.includes('text/plain')) {
      // Extract plain text content
      textContent = extractMessageBody(rawMessage);
      return { text: textContent, html: '', attachments: [] };
    }
  }

  // Extract the boundary from the Content-Type header
  const boundaryMatch = rawMessage.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) {
    // If no boundary found, try to extract the body as plain text
    textContent = extractMessageBody(rawMessage);
    return { text: textContent, html: '', attachments: [] };
  }

  const boundary = boundaryMatch[1];
  
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
      // Extract filename from Content-Disposition if available
      const filenameMatch = part.match(/filename="([^"]+)"/i);
      const filename = filenameMatch ? filenameMatch[1] : `attachment-${i}.${getExtensionFromMimeType(contentType)}`;
      
      attachments.push({
        filename,
        mimeType: contentType,
        size: content.length,
        content: null // We don't handle binary content here
      });
    }
  }
  
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