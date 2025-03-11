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
  console.log('Parsing multipart message, length:', rawMessage.length);
  
  // Check if this is a forwarded message
  const isForwarded = rawMessage.includes('---------- Forwarded message ---------') || 
                     rawMessage.includes('Begin forwarded message:');
  
  if (isForwarded) {
    console.log('Detected forwarded message format');
  }
  
  // Initialize result object
  const result = {
    html: '',
    text: '',
    attachments: []
  };
  
  try {
    // Try to find Content-Type header
    const contentTypeMatch = rawMessage.match(/Content-Type:\s*([^;\r\n]+)/i);
    const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : '';
    console.log('Detected Content-Type:', contentType || 'not found');
    
    // Check if this is a multipart message
    if (contentType.includes('multipart/')) {
      // Extract boundary
      const boundaryMatch = rawMessage.match(/boundary="?([^"\r\n]+)"?/i);
      
      if (boundaryMatch) {
        const boundary = boundaryMatch[1].trim();
        console.log('Found boundary:', boundary);
        
        // Split message into parts using the boundary
        const parts = rawMessage.split(new RegExp(`--${boundary}(?:--)?`, 'g'));
        console.log(`Split message into ${parts.length} parts`);
        
        // Process each part
        parts.forEach((part, index) => {
          if (!part.trim()) return;
          
          console.log(`Processing part ${index}, length: ${part.length}`);
          
          // Check content type of this part
          const partContentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
          const partContentType = partContentTypeMatch ? partContentTypeMatch[1].trim().toLowerCase() : '';
          
          console.log(`Part ${index} Content-Type:`, partContentType || 'not found');
          
          // Extract content based on type
          if (partContentType.includes('text/html')) {
            // Find the actual content (after headers)
            const htmlContent = part.split(/\r?\n\r?\n/).slice(1).join('\n\n');
            console.log(`Found HTML content in part ${index}, length: ${htmlContent.length}`);
            result.html = htmlContent.trim();
          } else if (partContentType.includes('text/plain')) {
            // Find the actual content (after headers)
            const textContent = part.split(/\r?\n\r?\n/).slice(1).join('\n\n');
            console.log(`Found text content in part ${index}, length: ${textContent.length}`);
            result.text = textContent.trim();
          } else if (partContentType.includes('multipart/')) {
            // Handle nested multipart content
            console.log(`Part ${index} contains nested multipart content`);
            const nestedResult = parseMultipartMessage(part);
            
            // Merge nested results
            if (nestedResult.html && !result.html) {
              result.html = nestedResult.html;
            }
            if (nestedResult.text && !result.text) {
              result.text = nestedResult.text;
            }
            if (nestedResult.attachments.length) {
              result.attachments = [...result.attachments, ...nestedResult.attachments];
            }
          } else if (partContentType) {
            // This might be an attachment
            console.log(`Part ${index} might be an attachment`);
            
            // Try to extract filename
            const filenameMatch = part.match(/filename="?([^"\r\n]+)"?/i);
            const filename = filenameMatch ? filenameMatch[1].trim() : `attachment-${index}`;
            
            // Add to attachments
            result.attachments.push({
              filename,
              contentType: partContentType,
              content: part.split(/\r?\n\r?\n/).slice(1).join('\n\n')
            });
            
            console.log(`Added attachment: ${filename}`);
          }
        });
      } else {
        console.log('No boundary found in multipart message');
      }
    } else if (contentType.includes('text/html')) {
      // This is a simple HTML message
      console.log('Processing as simple HTML message');
      const htmlContent = rawMessage.split(/\r?\n\r?\n/).slice(1).join('\n\n');
      result.html = htmlContent.trim();
      console.log('Extracted HTML content, length:', result.html.length);
    } else if (contentType.includes('text/plain') || !contentType) {
      // This is a simple text message or couldn't determine content type
      console.log('Processing as simple text message');
      const textContent = rawMessage.split(/\r?\n\r?\n/).slice(1).join('\n\n');
      result.text = textContent.trim();
      console.log('Extracted text content, length:', result.text.length);
    }
    
    // Special handling for forwarded messages if we couldn't extract HTML content
    if (isForwarded && !result.html) {
      console.log('Creating HTML representation for forwarded message');
      
      // Use the text content or the raw message if no text content was extracted
      const forwardedContent = result.text || rawMessage;
      
      // Create a simple HTML representation
      result.html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <div style="white-space: pre-wrap;">${forwardedContent.replace(/\n/g, '<br>')}</div>
        </div>
      `;
      
      console.log('Created HTML content for forwarded message, length:', result.html.length);
    }
    
    // If we still don't have HTML content but have text, create simple HTML
    if (!result.html && result.text) {
      console.log('Creating simple HTML from text content');
      result.html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <div style="white-space: pre-wrap;">${result.text.replace(/\n/g, '<br>')}</div>
        </div>
      `;
      console.log('Created HTML from text, length:', result.html.length);
    }
    
    // Final check of results
    console.log('Final parsing results:');
    console.log('- HTML content:', result.html ? 'Yes' : 'No', result.html ? `(${result.html.length} chars)` : '');
    console.log('- Text content:', result.text ? 'Yes' : 'No', result.text ? `(${result.text.length} chars)` : '');
    console.log('- Attachments:', result.attachments.length);
    
    return result;
  } catch (error) {
    console.error('Error parsing multipart message:', error);
    
    // Fallback: if parsing fails, return the raw message as text
    console.log('Parsing failed, using raw message as text');
    return {
      html: '',
      text: rawMessage,
      attachments: []
    };
  }
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