import React from 'react';
import DOMPurify from 'dompurify';
import styled from 'styled-components';

// Styled container that isolates email styles from the rest of the application
const EmailContainer = styled.div`
  /* Base styles */
  line-height: 1.6;
  font-family: Arial, sans-serif;
  color: #333;
  
  /* Isolation container */
  all: initial;
  display: block;
  border-radius: 8px;
  overflow: hidden;
  
  /* Ensure the container itself has proper styling */
  & {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
  }
  
  /* Style iframe for HTML emails */
  & iframe {
    width: 100%;
    border: none;
    background: white;
  }
  
  /* Style for plain text fallback */
  & .plain-text {
    white-space: pre-wrap;
    word-break: break-word;
    padding: 15px;
    background: white;
  }
  
  /* Make sure links are properly styled */
  & a {
    color: #0066cc;
    text-decoration: underline;
  }
  
  & a:hover {
    text-decoration: none;
  }
  
  /* Ensure images don't overflow */
  & img {
    max-width: 100%;
    height: auto;
  }
`;

/**
 * SafeEmailViewer component for displaying HTML emails safely
 * 
 * @param {Object} props - Component props
 * @param {string} props.htmlContent - HTML content of the email
 * @param {string} props.textContent - Plain text content as fallback
 * @param {string} props.className - Optional className for styling
 * @returns {React.ReactElement} - Rendered component
 */
const SafeEmailViewer = ({ htmlContent, textContent, className }) => {
  // Create a ref for the iframe
  const iframeRef = React.useRef(null);
  
  // Log the content received by the component
  React.useEffect(() => {
    console.log('SafeEmailViewer received:');
    console.log('- HTML content length:', (htmlContent || '').length);
    console.log('- Text content length:', (textContent || '').length);
    console.log('- HTML content preview:', (htmlContent || '').substring(0, 100));
  }, [htmlContent, textContent]);
  
  // Function to create and write to the iframe
  const writeToIframe = React.useCallback(() => {
    if (!iframeRef.current) return;
    
    const iframe = iframeRef.current;
    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
    
    // Create a sanitized version of the HTML content
    const sanitizedHtml = DOMPurify.sanitize(htmlContent, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      ALLOW_DATA_ATTR: false
    }) || ''; // Ensure we have a string even if DOMPurify returns undefined
    
    console.log('Writing sanitized HTML to iframe, length:', sanitizedHtml.length);
    
    // Write the HTML to the iframe
    iframeDocument.open();
    iframeDocument.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <base target="_blank">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 15px;
            }
            a {
              color: #0066cc;
            }
            img {
              max-width: 100%;
              height: auto;
            }
          </style>
        </head>
        <body>${sanitizedHtml}</body>
      </html>
    `);
    iframeDocument.close();
    
    // Add click event listeners to make links open in a new tab
    const links = iframeDocument.getElementsByTagName('a');
    console.log('Found links in email:', links.length);
    for (let i = 0; i < links.length; i++) {
      links[i].setAttribute('target', '_blank');
      links[i].setAttribute('rel', 'noopener noreferrer');
    }
    
    // Adjust iframe height to match content
    const body = iframeDocument.body;
    const html = iframeDocument.documentElement;
    
    const height = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      html.clientHeight,
      html.scrollHeight,
      html.offsetHeight
    );
    
    iframe.style.height = `${height}px`;
    console.log('Adjusted iframe height to:', height);
  }, [htmlContent]);
  
  // Set up the iframe when the component mounts or htmlContent changes
  React.useEffect(() => {
    if (htmlContent) {
      writeToIframe();
      
      // Add a window resize listener to adjust iframe height
      const handleResize = () => writeToIframe();
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [htmlContent, writeToIframe]);
  
  // Determine what to render based on available content
  const renderContent = () => {
    if (htmlContent) {
      return (
        <iframe 
          ref={iframeRef}
          title="Email content"
          sandbox="allow-same-origin allow-popups"
        />
      );
    } else if (textContent) {
      // Fallback to plain text if no HTML content
      return (
        <div className="plain-text">
          {textContent}
        </div>
      );
    } else {
      // No content available
      return (
        <div className="plain-text">
          No content available for this email.
        </div>
      );
    }
  };
  
  return (
    <EmailContainer className={className}>
      {renderContent()}
    </EmailContainer>
  );
};

export default SafeEmailViewer; 