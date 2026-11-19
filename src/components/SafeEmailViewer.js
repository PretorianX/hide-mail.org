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

const RemoteBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: #fff8e1;
  border-bottom: 1px solid #ffe082;
  color: #5d4037;
  font-size: 13px;
`;

const RemoteButton = styled.button`
  background: #f7941d;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: #e08210;
  }
`;

const SAFE_INLINE_URI = /^(data:|cid:|#)/i;
const CSS_REMOTE_PATTERN = /url\s*\(|@import/i;

function blockRemoteHtmlContent(html) {
  if (!html) return { html: '', blocked: false };
  let blocked = false;
  if (typeof DOMParser === 'undefined') {
    return { html, blocked: false };
  }
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    'text/html'
  );

  doc.querySelectorAll('style, link').forEach((el) => {
    blocked = true;
    el.remove();
  });

  doc.querySelectorAll('[src], [srcset], [poster], [background]').forEach((el) => {
    ['src', 'srcset', 'poster', 'background'].forEach((attr) => {
      if (!el.hasAttribute(attr)) return;
      const val = (el.getAttribute(attr) || '').trim();
      if (attr === 'srcset' || attr === 'background' || (val && !SAFE_INLINE_URI.test(val))) {
        el.removeAttribute(attr);
        blocked = true;
      }
    });
  });

  doc.querySelectorAll('[style]').forEach((el) => {
    const styleVal = el.getAttribute('style') || '';
    if (CSS_REMOTE_PATTERN.test(styleVal)) {
      const cleaned = styleVal
        .replace(/@import[^;]*;?/gi, '')
        .replace(/url\s*\([^)]*\)/gi, 'none');
      el.setAttribute('style', cleaned);
      blocked = true;
    }
  });

  return { html: doc.body ? doc.body.innerHTML : html, blocked };
}

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
  const [remoteOptInHtml, setRemoteOptInHtml] = React.useState(null);
  const allowRemoteContent = Boolean(htmlContent) && remoteOptInHtml === htmlContent;
  const [hasBlockedRemote, setHasBlockedRemote] = React.useState(false);

  // Reset blocked-content indicator and clear stale opt-in whenever a different email is rendered
  React.useEffect(() => {
    setHasBlockedRemote(false);
    setRemoteOptInHtml((prev) => (prev === htmlContent ? prev : null));
  }, [htmlContent]);
  
  // Log content metadata only in development (never log message previews in production)
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    console.log('SafeEmailViewer received:', {
      htmlLength: (htmlContent || '').length,
      textLength: (textContent || '').length,
    });
    if (!htmlContent && !textContent) {
      console.warn('SafeEmailViewer: No content received (both HTML and text are empty)');
    } else if (htmlContent && htmlContent.includes('Content-Type:')) {
      console.warn('SafeEmailViewer: HTML content appears to be raw email headers');
    }
  }, [htmlContent, textContent]);
  
  // Function to create and write to the iframe
  const writeToIframe = React.useCallback(() => {
    if (!iframeRef.current) return;
    
    const iframe = iframeRef.current;
    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
    
    // Create a sanitized version of the HTML content
    const rawSanitized = DOMPurify.sanitize(htmlContent, {
      ADD_TAGS: allowRemoteContent ? ['style'] : [],
      ADD_ATTR: ['target'],
      FORBID_TAGS: allowRemoteContent
        ? ['script', 'iframe', 'object', 'embed']
        : ['script', 'iframe', 'object', 'embed', 'style', 'link'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      ALLOW_DATA_ATTR: false
    }) || '';

    let sanitizedHtml = rawSanitized;
    if (!allowRemoteContent) {
      const result = blockRemoteHtmlContent(rawSanitized);
      sanitizedHtml = result.html;
      const hadStyleOrLink = /<(style|link)\b/i.test(htmlContent || '');
      setHasBlockedRemote(result.blocked || hadStyleOrLink);
    }

    const iframeCsp = allowRemoteContent
      ? ''
      : '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;">';

    if (process.env.NODE_ENV === 'development') {
      console.log('Writing sanitized HTML to iframe, length:', sanitizedHtml.length);
    }
    
    // Write the HTML to the iframe
    iframeDocument.open();
    iframeDocument.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${iframeCsp}
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
    if (process.env.NODE_ENV === 'development') {
      console.log('Found links in email:', links.length);
    }
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
    if (process.env.NODE_ENV === 'development') {
      console.log('Adjusted iframe height to:', height);
    }
  }, [htmlContent, allowRemoteContent]);
  
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
    // Check if we have valid HTML content
    if (htmlContent && htmlContent.trim().length > 0) {
      return (
        <iframe 
          ref={iframeRef}
          title="Email content"
          sandbox="allow-same-origin allow-popups"
        />
      );
    } 
    // Check if we have valid text content
    else if (textContent && textContent.trim().length > 0) {
      // Fallback to plain text if no HTML content
      return (
        <div className="plain-text">
          {textContent}
        </div>
      );
    } 
    // No valid content available
    else {
      return (
        <div className="plain-text">
          No content available for this email.
        </div>
      );
    }
  };
  
  return (
    <EmailContainer className={className}>
      {htmlContent && hasBlockedRemote && !allowRemoteContent && (
        <RemoteBanner role="status">
          <span>Remote images and external styles are blocked to protect your privacy.</span>
          <RemoteButton type="button" onClick={() => setRemoteOptInHtml(htmlContent)}>
            Load remote content
          </RemoteButton>
        </RemoteBanner>
      )}
      {renderContent()}
    </EmailContainer>
  );
};

export default SafeEmailViewer; 