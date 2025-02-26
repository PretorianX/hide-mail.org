import React from 'react';
import './MessageView.css';

const MessageView = ({ message, onDelete, onBack }) => {
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
            <span className="meta-label">Date:</span> {new Date(message.receivedAt).toLocaleString()}
          </div>
        </div>
      </div>
      
      <div className="message-view-content">
        {message.html ? (
          <div 
            className="message-html-content"
            dangerouslySetInnerHTML={{ __html: message.html }}
          />
        ) : (
          <div className="message-text-content">
            {message.text.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
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