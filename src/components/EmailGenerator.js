import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import EmailService from '../services/EmailService';
import { getConfig } from '../utils/configLoader';

const GeneratorContainer = styled.div`
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 30px;
  margin-bottom: 30px;
`;

const Title = styled.h1`
  font-size: 24px;
  margin-bottom: 20px;
  color: var(--primary-color);
`;

const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const SelectContainer = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const Label = styled.label`
  font-weight: 500;
`;

const Select = styled.select`
  padding: 10px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  flex: 1;
`;

const EmailDisplay = styled.div`
  background-color: var(--secondary-color);
  padding: 15px;
  border-radius: 4px;
  font-size: 18px;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TimerContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Timer = styled.div`
  font-size: 16px;
  color: ${props => props.isExpiring ? 'red' : 'var(--text-color)'};
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 10px;
`;

function EmailGenerator() {
  const [domains] = useState(getConfig('email.domains'));
  const [selectedDomain, setSelectedDomain] = useState(domains[0]);
  const [email, setEmail] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(getConfig('email.expirationTime'));
  const navigate = useNavigate();

  useEffect(() => {
    // Generate email on component mount or domain change
    handleGenerateEmail();
  }, [selectedDomain]);

  useEffect(() => {
    // Timer countdown
    if (timeRemaining <= 0) return;
    
    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeRemaining]);

  const handleGenerateEmail = async () => {
    try {
      // In a real app, this would call your backend API
      const generatedEmail = await EmailService.generateEmail(selectedDomain);
      setEmail(generatedEmail);
      setTimeRemaining(getConfig('email.expirationTime')); // Reset timer to configured expiration time
      
      // Save to localStorage for persistence
      localStorage.setItem('tempEmail', generatedEmail);
      localStorage.setItem('expiryTime', Date.now() + (timeRemaining * 1000));
    } catch (error) {
      console.error('Failed to generate email:', error);
    }
  };

  const handleExtendTime = async () => {
    try {
      // In a real app, this would call your backend API
      await EmailService.refreshExpirationTime();
      const extensionTime = getConfig('email.extensionTime');
      setTimeRemaining(prev => prev + extensionTime);
      
      // Update localStorage
      localStorage.setItem('expiryTime', Date.now() + (timeRemaining * 1000) + (extensionTime * 1000));
    } catch (error) {
      console.error('Failed to extend email lifetime:', error);
    }
  };

  const handleViewInbox = () => {
    navigate('/inbox');
  };

  // Format time remaining as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <GeneratorContainer>
      <Title>Generate Temporary Email</Title>
      <Form>
        <SelectContainer>
          <Label htmlFor="domain-select">Select Domain:</Label>
          <Select 
            id="domain-select"
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
          >
            {domains.map(domain => (
              <option key={domain} value={domain}>{domain}</option>
            ))}
          </Select>
        </SelectContainer>
        
        {email && (
          <>
            <EmailDisplay>
              <span>{email}</span>
              <button onClick={() => navigator.clipboard.writeText(email)}>
                Copy
              </button>
            </EmailDisplay>
            
            <TimerContainer>
              <Timer isExpiring={timeRemaining < 300}>
                Expires in: {formatTime(timeRemaining)}
              </Timer>
              <ButtonContainer>
                <button onClick={handleExtendTime}>
                  Extend (+{getConfig('email.extensionTime') / 60} min)
                </button>
                <button onClick={handleViewInbox}>
                  View Inbox
                </button>
              </ButtonContainer>
            </TimerContainer>
          </>
        )}
      </Form>
    </GeneratorContainer>
  );
}

export default EmailGenerator; 