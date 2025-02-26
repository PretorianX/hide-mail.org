/**
 * Parses a multipart email message and extracts text and HTML parts
 * @param {string} messageBody - The raw email message body
 * @returns {Object} An object containing text and html parts
 */
export const parseMultipartMessage = (messageBody) => {
  const result = {
    text: '',
    html: ''
  };
  
  if (!messageBody) return result;
  
  // Check if it's a multipart message
  if (messageBody.includes('Content-Type: multipart/')) {
    // Extract boundary
    const boundaryMatch = messageBody.match(/boundary="([^"]+)"/i);
    const boundary = boundaryMatch ? boundaryMatch[1] : null;
    
    if (boundary) {
      // Split by boundary
      const parts = messageBody.split(`--${boundary}`);
      
      // Process each part
      parts.forEach(part => {
        if (part.includes('Content-Type: text/plain')) {
          // Extract text content
          const contentMatch = part.match(/Content-Type: text\/plain;[\s\S]*?\r?\n\r?\n([\s\S]*?)$/i);
          if (contentMatch && contentMatch[1]) {
            result.text = contentMatch[1].trim();
          }
        } else if (part.includes('Content-Type: text/html')) {
          // Extract HTML content
          const contentMatch = part.match(/Content-Type: text\/html;[\s\S]*?\r?\n\r?\n([\s\S]*?)$/i);
          if (contentMatch && contentMatch[1]) {
            result.html = contentMatch[1].trim();
          }
        }
      });
    }
  } else if (messageBody.includes('Content-Type: text/plain')) {
    // Single part plain text
    const contentMatch = messageBody.match(/Content-Type: text\/plain;[\s\S]*?\r?\n\r?\n([\s\S]*?)$/i);
    if (contentMatch && contentMatch[1]) {
      result.text = contentMatch[1].trim();
    }
  } else if (messageBody.includes('Content-Type: text/html')) {
    // Single part HTML
    const contentMatch = messageBody.match(/Content-Type: text\/html;[\s\S]*?\r?\n\r?\n([\s\S]*?)$/i);
    if (contentMatch && contentMatch[1]) {
      result.html = contentMatch[1].trim();
    }
  } else {
    // Fallback: treat the whole body as text
    result.text = messageBody.trim();
  }
  
  return result;
}; 