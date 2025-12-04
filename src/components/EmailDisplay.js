import React, { useState, useRef } from 'react';
import './EmailDisplay.css';

const EmailDisplay = ({ email }) => {
  const [copied, setCopied] = useState(false);
  const mouseDownPos = useRef(null);

  const copyToClipboard = () => {
    if (!email) return;
    
    navigator.clipboard.writeText(email)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy email: ', err);
      });
  };

  const handleMouseDown = (e) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleEmailClick = (e) => {
    // Check if user was selecting text (mouse moved during click)
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx > 5 || dy > 5) {
        // User was selecting text, don't copy
        return;
      }
    }
    
    // Check if any text is selected
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    
    copyToClipboard();
  };

  return (
    <div className="email-display-container">
      <div className="email-display-header">
        <h2>Your Duck Mail Address</h2>
      </div>
      
      <div className="email-display-content">
        <div 
          className={`email-address ${copied ? 'copied' : ''}`}
          onMouseDown={handleMouseDown}
          onClick={handleEmailClick}
          title="Click to copy"
        >
          <span className="email-text">{email || 'Loading...'}</span>
          <button 
            className={`copy-icon-button ${copied ? 'copied' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard();
            }}
            disabled={!email}
            aria-label="Copy to clipboard"
            title={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
      
      <div className="email-display-info">
        <p>This email address will expire in 30 minutes unless refreshed.</p>
        <p>All emails sent to this address will appear in your inbox below.</p>
      </div>
    </div>
  );
};

export default EmailDisplay; 