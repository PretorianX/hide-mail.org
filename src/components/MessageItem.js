import React from 'react';
import './MessageItem.css';

const MessageItem = ({ message, onClick }) => {
  // Get the full preview text without truncation
  const getPreviewText = () => {
    return message.text || message.preview || '';
  };

  return (
    <div className="message-item" onClick={onClick}>
      <div className="message-header">
        <div className="message-from">{message.from}</div>
        <div className="message-date">
          {new Date(message.date).toLocaleString()}
        </div>
      </div>
      <div className="message-subject">{message.subject}</div>
      <div className="message-preview">{getPreviewText()}</div>
    </div>
  );
};

export default MessageItem; 