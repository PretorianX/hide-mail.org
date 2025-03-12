import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import SafeEmailViewer from './SafeEmailViewer';
import EmailService from '../services/EmailService';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  overflow-y: auto;
`;

const ModalContent = styled.div`
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const ModalHeader = styled.div`
  padding: 20px;
  border-bottom: 1px solid #eee;
`;

const ModalTitle = styled.h2`
  margin: 0 0 10px 0;
  font-size: 1.5rem;
`;

const ModalDetails = styled.div`
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  font-size: 14px;
  color: #666;
`;

const ModalBody = styled.div`
  padding: 20px;
  overflow-y: auto;
  flex: 1;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  
  &:hover {
    color: #333;
  }
`;

const LoadingIndicator = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #666;
`;

/**
 * EmailModal component for displaying email content in a modal
 * 
 * @param {Object} props - Component props
 * @param {Object} props.message - The email message object
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to call when closing the modal
 * @returns {React.ReactElement|null} - Rendered component or null if not open
 */
const EmailModal = ({ message, isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && message) {
      // Log the message data to help with debugging
      console.log('Email modal opened with message:', message);
      console.log('Message contains html:', !!message.html);
      console.log('Message contains text:', !!message.text);
    }
  }, [isOpen, message]);

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // If the modal is not open, don't render anything
  if (!isOpen || !message) {
    return null;
  }

  return (
    <ModalOverlay onClick={onClose} data-testid="modal-overlay">
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <CloseButton onClick={onClose}>&times;</CloseButton>
        
        <ModalHeader>
          <ModalTitle>{message.subject}</ModalTitle>
          <ModalDetails>
            <div>From: {message.from}</div>
            <div>Received: {formatDate(message.date || message.receivedAt || message.timestamp)}</div>
          </ModalDetails>
        </ModalHeader>
        
        <ModalBody>
          {loading ? (
            <LoadingIndicator>Loading email content...</LoadingIndicator>
          ) : (
            <SafeEmailViewer 
              htmlContent={message.html || ''} 
              textContent={message.text || ''} 
            />
          )}
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
};

export default EmailModal; 