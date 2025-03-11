import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import EmailService from './services/EmailService.js';
import MailboxTimer from './components/MailboxTimer.js';
import { parseMultipartMessage } from './utils/messageParser.js';
import { formatDate } from './utils/dateUtils.js';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import styled from 'styled-components';
import Header from './components/Header.js';
import EmailGenerator from './components/EmailGenerator.js';
import EmailViewer from './components/EmailViewer.js';
import ConfigProvider from './components/ConfigProvider.js';
import GlobalStyle from './styles/GlobalStyle.js';
import PrivacyPolicy from './pages/PrivacyPolicy.js';
import TermsOfService from './pages/TermsOfService.js';
import AboutUs from './pages/AboutUs.js';
import ContactUs from './pages/ContactUs.js';

const AppContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Roboto', sans-serif;
`;

// Add a styled footer component with links
const FooterContainer = styled.footer`
  margin-top: 40px;
  padding: 20px 0;
  border-top: 1px solid #eee;
  text-align: center;
`;

const FooterLinks = styled.div`
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 15px;
`;

const FooterLink = styled(Link)`
  color: #4285f4;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
`;

function App() {
  const [email, setEmail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const autoRefreshIntervalRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState('');

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await EmailService.initialize();
        
        // Get available domains
        const availableDomains = await EmailService.getAvailableDomains();
        setDomains(availableDomains);
        
        // Check if we have a saved email
        if (EmailService.currentEmail) {
          setEmail(EmailService.currentEmail);
          // Load messages for the saved email
          fetchMessages(EmailService.currentEmail);
        } else {
          // Generate a new email if none exists
          const newEmail = await EmailService.generateEmail();
          setEmail(newEmail);
        }
      } catch (err) {
        console.error('Error initializing app:', err);
        setError(`Failed to initialize: ${err.message}`);
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
     
    // AdSense is now handled by adsense-config.js, so we don't need to load it here
     
    return () => {
      // Clear auto-refresh interval on unmount
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, []);

  // Set up auto-refresh when email changes or autoRefresh setting changes
  useEffect(() => {
    // Clear any existing interval
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
    
    // Set up new interval if autoRefresh is enabled and we have an email
    if (autoRefresh && email) {
      console.log('Setting up auto-refresh interval for', email);
      autoRefreshIntervalRef.current = setInterval(() => {
        console.log('Auto-refreshing messages...');
        fetchMessages(email);
      }, 3000); // Refresh every 3 seconds
    }
    
    // Clean up on unmount or when dependencies change
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [email, autoRefresh]);

  const fetchMessages = async (emailAddress) => {
    if (!emailAddress) {
      // Don't set an error if there's no email address
      return;
    }
    
    try {
      setRefreshing(true);
      
      // Check if the email has expired
      if (EmailService.isExpired()) {
        handleMailboxExpired();
        return;
      }
      
      // Fetch messages from the API
      const fetchedMessages = await EmailService.getMessages(emailAddress);
      
      // Process messages
      const processedMessages = fetchedMessages.map(message => {
        // Parse multipart messages if needed
        if (message.contentType && message.contentType.includes('multipart')) {
          const parts = parseMultipartMessage(message.content, message.contentType);
          return {
            ...message,
            content: parts.html || parts.text || message.content,
            isHtml: !!parts.html
          };
        }
        
        return message;
      });
      
      setMessages(processedMessages);
      setError(null); // Clear any existing errors
    } catch (err) {
      console.error('Error fetching messages:', err);
      // Only set error if it's not an expired mailbox
      if (err.message !== 'Mailbox expired') {
        setError(`Failed to fetch messages: ${err.message}`);
      } else {
        handleMailboxExpired();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleGenerateEmail = async (domainOverride = null) => {
    try {
      setLoading(true);
      // Use the provided domain override if available, otherwise use the selectedDomain state
      const domainToUse = domainOverride !== null ? domainOverride : selectedDomain;
      const newEmail = await EmailService.generateEmail(domainToUse);
      setEmail(newEmail);
      setMessages([]);
    } catch (err) {
      console.error('Error generating email:', err);
      setError('Failed to generate email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshMessages = () => {
    if (email) {
      fetchMessages(email);
    }
  };

  const handleCopyClick = () => {
    if (email) {
      navigator.clipboard.writeText(email)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error('Failed to copy email:', err);
          setError('Failed to copy email to clipboard');
        });
    }
  };

  const handleMailboxExpired = () => {
    // Instead of setting an error message, just clear the email and messages
    setEmail(null);
    setMessages([]);
    // Don't set an error message here
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  const sendTestEmail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Send a test email via the backend API
      const apiUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/test-email`;
      console.log('Sending test email to:', email);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(`Failed to send test email: ${data.error || response.statusText}`);
      } else {
        setError(`Test email sent successfully! Check your inbox in a few seconds.`);
        // Wait 3 seconds then fetch messages
        setTimeout(() => {
          fetchMessages(email);
        }, 3000);
      }
    } catch (err) {
      console.error('Error sending test email:', err);
      setError(`Error sending test email: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Router>
      <GlobalStyle />
      <div className="app">
        <Header />
        
        <Routes>
          <Route path="/" element={
            <>
              <div className="ad-container">
                <div className="ad-banner">Google Ad Banner (728x90)</div>
              </div>
              
              <div className="app-layout">
                <div className="main-content">
                  <main className="app-main">
                    <section className="email-section">
                      <div className="email-container">
                        <h2>Your Hide Mail Address</h2>
                        
                        <div className="domain-selector">
                          <label htmlFor="domain-select">Choose a domain:</label>
                          <select
                            id="domain-select"
                            data-testid="domain-select"
                            className="domain-select"
                            aria-label="Choose a domain"
                            value={selectedDomain}
                            onChange={(e) => setSelectedDomain(e.target.value)}
                          >
                            <option value="">Random domain</option>
                            {domains && domains.length > 0 && domains.map(domain => (
                              <option key={domain} value={domain}>
                                {domain}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        {loading ? (
                          <p>Generating email address...</p>
                        ) : error && error !== 'Your mailbox has expired. Please generate a new email address.' ? (
                          <div className="error-message">{error}</div>
                        ) : email ? (
                          <>
                            <div className="email-display">
                              {email}
                            </div>
                            
                            <MailboxTimer 
                              onExpire={handleMailboxExpired} 
                              onExtend={handleRefreshMessages}
                            />
                            
                            <div className="email-actions">
                              <button onClick={() => handleGenerateEmail(selectedDomain)}>Generate New Email</button>
                              <button onClick={handleRefreshMessages}>Check Messages</button>
                            </div>
                          </>
                        ) : (
                          <div className="generate-email-container">
                            <p>Your mailbox has expired or you haven't generated an email yet.</p>
                            <button 
                              className="generate-button"
                              onClick={() => handleGenerateEmail(selectedDomain)}
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Generate New Email
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
                    
                    <section className="messages-section">
                      <h2>Hide Mail Inbox</h2>
                      
                      {loading ? (
                        <p>Loading messages...</p>
                      ) : error && error !== 'Your mailbox has expired. Please generate a new email address.' ? (
                        <div className="error-message">{error}</div>
                      ) : !email ? (
                        <div className="generate-email-container">
                          <p>Generate an email address to start receiving messages.</p>
                          <button 
                            className="generate-button"
                            onClick={() => handleGenerateEmail(selectedDomain)}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Generate New Email
                          </button>
                        </div>
                      ) : messages.length === 0 ? (
                        <p>Your inbox is empty. Messages will appear here when you receive them.</p>
                      ) : (
                        <ul className="message-list">
                          {messages.map(message => (
                            <li key={message.id} className="message-item">
                              <div className="message-header">
                                <span>{message.from}</span>
                                <span>{formatDate(message.date)}</span>
                              </div>
                              <div className="message-subject">{message.subject}</div>
                              <div className="message-preview">{message.preview}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </main>
                </div>
                
                <div className="sidebar">
                  <div className="ad-container">
                    <div className="ad-sidebar">Google Ad (300x250)</div>
                  </div>
                  
                  <div className="email-section">
                    <h2>Why Use Hide Mail?</h2>
                    <ul>
                      <li>🦆 100% Free temporary email</li>
                      <li>🦆 No registration required</li>
                      <li>🦆 Protect your privacy</li>
                      <li>🦆 Avoid spam in your personal inbox</li>
                      <li>🦆 Perfect for one-time signups</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="ad-container">
                <div className="ad-banner">Google Ad Banner (728x90)</div>
              </div>
            </>
          } />
          
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/contact" element={<ContactUs />} />
        </Routes>
        
        <FooterContainer className="footer">
          <FooterLinks>
            <FooterLink to="/privacy">Privacy Policy</FooterLink>
            <FooterLink to="/terms">Terms of Service</FooterLink>
            <FooterLink to="/about">About Us</FooterLink>
            <FooterLink to="/contact">Contact Us</FooterLink>
          </FooterLinks>
          <p>© 2025 Hide Mail - The friendly temporary email service</p>
          <p>We value your privacy. Hide Mail does not store or share your personal information.</p>
        </FooterContainer>
      </div>
    </Router>
  );
}

export default App; 