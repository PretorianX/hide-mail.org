import React, { useState } from 'react';
import './MessageList.css';
import EmailModal from './EmailModal';
import ForwardButton from './ForwardButton';

const MessageList = ({ messages, onSelectMessage, selectedMessageId, tempMailbox }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);

  // Inline parts belong to the message body, so only real files are worth announcing here.
  const countFiles = (message) =>
    (message.attachments || []).filter((attachment) => !attachment.inline).length;

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

  const handleMessageClick = (message) => {
    setSelectedMessage(message);
    setModalOpen(true);
    
    // Also call the parent's onSelectMessage if provided
    if (onSelectMessage) {
      onSelectMessage(message.id);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
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
            onClick={() => handleMessageClick(message)}
          >
            <div className="message-sender">{message.from}</div>
            <div className="message-subject">{message.subject}</div>
            <div className="message-preview">{formatPreview(message)}</div>
            <div className="message-footer">
              <div className="message-footer-meta">
                <div className="message-date">
                  {new Date(message.date).toLocaleString()}
                </div>
                {countFiles(message) > 0 && (
                  <div
                    className="message-attachment-count"
                    data-testid={`attachment-indicator-${message.id}`}
                    title={`${countFiles(message)} attachment(s)`}
                  >
                    <span aria-hidden="true">📎</span>
                    <span>{countFiles(message)}</span>
                  </div>
                )}
              </div>
              {tempMailbox && (
                <div className="message-actions" onClick={(e) => e.stopPropagation()}>
                  <ForwardButton 
                    tempMailbox={tempMailbox} 
                    messageId={message.id}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Email Modal */}
      <EmailModal 
        message={selectedMessage}
        isOpen={modalOpen}
        onClose={handleCloseModal}
        tempMailbox={tempMailbox}
      />
    </div>
  );
};

export default MessageList; 