import React from 'react';
import './MessageItem.css';
import { formatDate } from '../utils/dateUtils.js';

const MessageItem = ({ message, onClick }) => {
  // Get the full preview text without truncation
  const getPreviewText = () => {
    return message.text || message.preview || '';
  };

  return (
    <div className="message-item" onClick={onClick}>
      <div className="message-header">
        <div className="message-from">{message.from}</div>
        <div className="message-date" data-testid="message-date">
          {formatDate(message.date || message.receivedAt)}
        </div>
      </div>
      <div className="message-subject">{message.subject}</div>
      <div className="message-preview" data-testid="message-preview">{getPreviewText()}</div>
    </div>
  );
};

export default MessageItem; 