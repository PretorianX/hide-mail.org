import React, { useState } from 'react';
import './MessageView.css';

const MessageView = ({ message, onDelete, onBack }) => {
  const [showImages, setShowImages] = useState(false);
  
  // Function to sanitize HTML content
  const sanitizeHtml = (html) => {
    // This is a simple implementation - in production, use a library like DOMPurify
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/g, '')
      .replace(/on\w+='[^']*'/g, '');
  };
  
  // Function to handle image display in HTML content
  const processHtmlContent = (html) => {
    if (!html) return '';
    
    // Sanitize HTML first
    let sanitized = sanitizeHtml(html);
    
    // If images are not allowed to be shown, replace img tags with placeholders
    if (!showImages) {
      sanitized = sanitized.replace(/<img\b[^>]*>/gi, '<div class="blocked-image">🖼️ Image (blocked)</div>');
    }
    
    return sanitized;
  };

  // Function to extract and format the message content
  const getMessageContent = () => {
    if (!message) return '';
    
    // If we have HTML content, use that
    if (message.html) {
      const processedHtml = processHtmlContent(message.html);
      
      return (
        <div className="message-html-wrapper">
          {!showImages && (
            <div className="image-blocker-notice">
              <p>Images have been blocked for your security.</p>
              <button onClick={() => setShowImages(true)}>Show Images</button>
            </div>
          )}
          <div 
            className="message-html-content" 
            dangerouslySetInnerHTML={{ __html: processedHtml }} 
          />
        </div>
      );
    }
    
    // If we have text content, use that
    if (message.text) {
      return (
        <div className="message-text-content">
          {message.text.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      );
    }
    
    // If we have a raw body, try to extract the text part
    if (message.body) {
      // Check if it's a multipart message
      if (message.body.includes('Content-Type: multipart/')) {
        // Try to extract HTML part first
        const htmlMatch = message.body.match(/Content-Type: text\/html;[\s\S]*?(?=--b1_|$)/i);
        if (htmlMatch) {
          const htmlContent = htmlMatch[0].split('\n').slice(2).join('\n').trim();
          const processedHtml = processHtmlContent(htmlContent);
          
          return (
            <div className="message-html-wrapper">
              {!showImages && (
                <div className="image-blocker-notice">
                  <p>Images have been blocked for your security.</p>
                  <button onClick={() => setShowImages(true)}>Show Images</button>
                </div>
              )}
              <div 
                className="message-html-content" 
                dangerouslySetInnerHTML={{ __html: processedHtml }} 
              />
            </div>
          );
        }
        
        // If no HTML part, try to extract text part
        const textMatch = message.body.match(/Content-Type: text\/plain;[\s\S]*?(?=--b1_|$)/i);
        if (textMatch) {
          const textContent = textMatch[0].split('\n').slice(2).join('\n').trim();
          return (
            <div className="message-text-content">
              {textContent.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          );
        }
        
        // If we couldn't extract any parts, show the raw body
        return (
          <div className="message-raw-content">
            <pre>{message.body}</pre>
          </div>
        );
      }
    }
    
    // Fallback to preview
    return <p>{message.preview || 'No content available'}</p>;
  };

  if (!message) {
    return (
      <div className="message-view-container">
        <div className="message-view-placeholder">
          <p>Select a message to view its contents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-view-container">
      <div className="message-view-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <button className="delete-button" onClick={() => onDelete(message.id)}>
          Delete
        </button>
      </div>
      
      <div className="message-view-details">
        <div className="message-view-subject">{message.subject}</div>
        <div className="message-view-meta">
          <div className="message-view-from">
            <span className="meta-label">From:</span> {message.from}
          </div>
          <div className="message-view-date">
            <span className="meta-label">Date:</span> {new Date(message.date).toLocaleString()}
          </div>
        </div>
      </div>
      
      <div className="message-view-content">
        {getMessageContent()}
      </div>
      
      {message.attachments && message.attachments.length > 0 && (
        <div className="message-attachments">
          <h3>Attachments</h3>
          <div className="attachment-list">
            {message.attachments.map((attachment, index) => (
              <div key={index} className="attachment-item">
                <span className="attachment-name">{attachment.filename}</span>
                <span className="attachment-size">
                  {(attachment.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageView; 