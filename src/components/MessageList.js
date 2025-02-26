import React from 'react';
import './MessageList.css';

const MessageList = ({ messages, onSelectMessage, selectedMessageId }) => {
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
            <div className="message-preview">{message.preview}</div>
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