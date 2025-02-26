import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { fetchEmails } from '../services/emailService';

const ViewerContainer = styled.div`
  display: flex;
  gap: 20px;
  height: 70vh;
`;

const EmailList = styled.div`
  flex: 1;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
`;

const EmailItem = styled.div`
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  background-color: ${props => props.isSelected ? 'rgba(74, 144, 226, 0.1)' : 'white'};
  
  &:hover {
    background-color: ${props => props.isSelected ? 'rgba(74, 144, 226, 0.1)' : 'rgba(74, 144, 226, 0.05)'};
  }
`;

const EmailSubject = styled.div`
  font-weight: ${props => props.isUnread ? 'bold' : 'normal'};
  margin-bottom: 5px;
`;

const EmailSender = styled.div`
  font-size: 14px;
  color: var(--light-text);
`;

const EmailTime = styled.div`
  font-size: 12px;
  color: var(--light-text);
  text-align: right;
`;

const EmailContent = styled.div`
  flex: 2;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 20px;
  overflow-y: auto;
`;

const EmailHeader = styled.div`
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 20px;
`;

const EmailTitle = styled.h2`
  margin-bottom: 10px;
`;

const EmailDetails = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--light-text);
`;

const EmailBody = styled.div`
  line-height: 1.6;
`;

const NoEmailSelected = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--light-text);
  font-size: 16px;
`;

const RefreshButton = styled.button`
  margin-bottom: 15px;
`;

function EmailViewer() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmails();
  }, []);

  const loadEmails = async () => {
    try {
      setLoading(true);
      const email = localStorage.getItem('tempEmail');
      if (!email) return;
      
      // In a real app, this would call your backend API
      const fetchedEmails = await fetchEmails(email);
      setEmails(fetchedEmails);
      
      // Select the first email if available and none is selected
      if (fetchedEmails.length > 0 && !selectedEmail) {
        setSelectedEmail(fetchedEmails[0]);
      }
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEmail = (email) => {
    setSelectedEmail(email);
    
    // Mark as read
    if (email.unread) {
      const updatedEmails = emails.map(e => 
        e.id === email.id ? { ...e, unread: false } : e
      );
      setEmails(updatedEmails);
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <>
      <RefreshButton onClick={loadEmails}>
        Refresh Inbox
      </RefreshButton>
      
      <ViewerContainer>
        <EmailList>
          {loading ? (
            <EmailItem>Loading emails...</EmailItem>
          ) : emails.length === 0 ? (
            <EmailItem>No emails received yet</EmailItem>
          ) : (
            emails.map(email => (
              <EmailItem 
                key={email.id} 
                isSelected={selectedEmail && selectedEmail.id === email.id}
                onClick={() => handleSelectEmail(email)}
              >
                <EmailSubject isUnread={email.unread}>
                  {email.subject}
                </EmailSubject>
                <EmailSender>{email.from}</EmailSender>
                <EmailTime>{formatDate(email.timestamp)}</EmailTime>
              </EmailItem>
            ))
          )}
        </EmailList>
        
        <EmailContent>
          {selectedEmail ? (
            <>
              <EmailHeader>
                <EmailTitle>{selectedEmail.subject}</EmailTitle>
                <EmailDetails>
                  <div>From: {selectedEmail.from}</div>
                  <div>Received: {formatDate(selectedEmail.timestamp)}</div>
                </EmailDetails>
              </EmailHeader>
              <EmailBody dangerouslySetInnerHTML={{ __html: selectedEmail.body }} />
            </>
          ) : (
            <NoEmailSelected>
              Select an email to view its content
            </NoEmailSelected>
          )}
        </EmailContent>
      </ViewerContainer>
    </>
  );
}

export default EmailViewer; 