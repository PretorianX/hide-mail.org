import React from 'react';
import './MessageList.css';

const MessageList = ({ messages, onSelectMessage, selectedMessageId }) => {
  // Function to format the message preview with proper length
  const formatPreview = (message) => {
    let preview = message.preview || '';
    
    // If preview is too short and we have text content, use that instead
    if (preview.length < 100 && message.text) {
      preview = message.text.substring(0, 200);
    }
    
    // Truncate with ellipsis if needed
    if (preview.length > 200) {
      return preview.substring(0, 200) + '...';
    }
    
    return preview;
  };

  if (!messages || messages.length === 0) {
    return (
      <div className="message-list-container">
        <div className="message-list-header">
          <h2>Inbox</h2>
        </div>
        <div className="empty-inbox">
          <p>Your inbox is empty</p>
          <p className="empty-inbox-subtext">Emails sent to your temporary address will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list-container">
      <div className="message-list-header">
        <h2>Inbox ({messages.length})</h2>
      </div>
      <div className="message-list">
        {messages.map((message) => (
          <div 
            key={message.id} 
            className={`message-item ${selectedMessageId === message.id ? 'selected' : ''}`}
            onClick={() => onSelectMessage(message.id)}
          >
            <div className="message-sender">{message.from}</div>
            <div className="message-subject">{message.subject}</div>
            <div className="message-preview">{formatPreview(message)}</div>
            <div className="message-date">
              {new Date(message.date).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MessageList; 