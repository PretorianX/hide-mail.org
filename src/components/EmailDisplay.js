import React, { useState } from 'react';
import './EmailDisplay.css';

const EmailDisplay = ({ email }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyClick = () => {
    if (!email) return;
    
    // Copy to clipboard
    navigator.clipboard.writeText(email)
      .then(() => {
        // Show copied message
        setCopied(true);
        
        // Reset after 2 seconds
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy email: ', err);
      });
  };

  return (
    <div className="email-display-container">
      <div className="email-display-header">
        <h2>Your Duck Mail Address</h2>
      </div>
      
      <div className="email-display-content">
        <div className="email-address">
          {email || 'Loading...'}
        </div>
        
        <button 
          className={`copy-button ${copied ? 'copied' : ''}`}
          onClick={handleCopyClick}
          disabled={!email}
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
      
      <div className="email-display-info">
        <p>This email address will expire in 30 minutes unless refreshed.</p>
        <p>All emails sent to this address will appear in your inbox below.</p>
      </div>
    </div>
  );
};

export default EmailDisplay; 