import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import EmailService from './services/EmailService.js';
import MailboxTimer from './components/MailboxTimer.js';
import { parseMultipartMessage } from './utils/messageParser.js';
import { formatDate } from './utils/dateUtils.js';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import Header from './components/Header.js';
import EmailGenerator from './components/EmailGenerator.js';
import EmailViewer from './components/EmailViewer.js';
import ConfigProvider from './components/ConfigProvider.js';
import GlobalStyle from './styles/GlobalStyle.js';
import DarkModeOverrides from './styles/DarkModeOverrides.js';
import { ThemeProvider } from './styles/ThemeContext.js';
import PrivacyPolicy from './pages/PrivacyPolicy.js';
import TermsOfService from './pages/TermsOfService.js';
import AboutUs from './pages/AboutUs.js';
import ContactUs from './pages/ContactUs.js';
import Blog from './pages/Blog.js';
import BlogPost from './pages/BlogPost.js';
import ContentAwareAd from './components/ContentAwareAd.js';
import CookieConsent from './components/CookieConsent.js';
import MessageList from './components/MessageList.js';

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
  flex-wrap: wrap;
  padding: 0 10px;
`;

const FooterLink = styled(Link)`
  color: #4285f4;
  text-decoration: none;
  transition: color 0.3s ease;
  cursor: pointer;
  display: inline-block;
  padding: 5px;
  
  &:hover {
    text-decoration: underline;
  }
  
  body[data-theme='dark'] & {
    color: var(--duck-orange);
    
    &:hover {
      color: var(--duck-orange-light);
    }
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
  const [selectedMessageId, setSelectedMessageId] = useState(null);

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

  const handleSelectMessage = (messageId) => {
    setSelectedMessageId(messageId);
  };

  return (
    <ThemeProvider>
      <Router>
        <GlobalStyle />
        <DarkModeOverrides />
        <ConfigProvider>
          <AppContainer>
            <Header />
            <div className="ad-container">
              <ContentAwareAd
                slot="9876543210"
                format="horizontal"
                width={728}
                height={90}
                position="top-of-page"
                contentSelector=".app-header"
                minContentLength={100}
              />
            </div>
            <Routes>
              <Route path="/" element={
                <>
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
                                value={selectedDomain}
                                onChange={(e) => setSelectedDomain(e.target.value)}
                                aria-label="Choose a domain"
                              >
                                <option value="">Random domain</option>
                                {domains.map(domain => (
                                  <option key={domain} value={domain}>{domain}</option>
                                ))}
                              </select>
                            </div>
                            {email ? (
                              <>
                                <div className="email-display">
                                  {email}
                                </div>
                                <MailboxTimer
                                  onExpire={handleMailboxExpired}
                                  onRefresh={handleRefreshMessages}
                                />
                                <div className="email-actions">
                                  <button onClick={handleGenerateEmail}>Generate New Email</button>
                                  <button onClick={handleRefreshMessages} disabled={refreshing}>
                                    {refreshing ? 'Checking...' : 'Check Messages'}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <EmailGenerator onGenerate={handleGenerateEmail} />
                            )}
                          </div>
                        </section>
                        <section className="messages-section">
                          <h2>Hide Mail Inbox</h2>
                          {error && <div className="error-message">{error}</div>}
                          {loading ? (
                            <p>Loading...</p>
                          ) : messages.length > 0 ? (
                            <MessageList
                              messages={messages}
                              onSelectMessage={handleSelectMessage}
                              selectedMessageId={selectedMessageId}
                            />
                          ) : (
                            <p>Your inbox is empty. Messages will appear here when you receive them.</p>
                          )}
                        </section>
                      </main>
                    </div>
                    <div className="sidebar">
                      <div className="ad-container">
                        <ContentAwareAd
                          slot="1234567890"
                          format="rectangle"
                          width={300}
                          height={250}
                          position="sidebar"
                          contentSelector=".email-section"
                          minContentLength={100}
                        />
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
                  
                  {/* Informative content for SEO and AdSense compliance - moved outside app-layout */}
                  <div className="informative-content-section">
                    <h2>Understanding Temporary Email Services</h2>
                    <div className="info-content-grid">
                      <div className="info-content-column">
                        <h3>What is a Temporary Email Service?</h3>
                        <p>A temporary email service provides disposable email addresses that you can use for a limited time. These services allow you to receive emails without revealing your personal email address, protecting your privacy and helping you avoid unwanted marketing communications.</p>
                        
                        <h3>Benefits of Using Hide Mail</h3>
                        <ul>
                          <li><strong>Enhanced Privacy:</strong> Keep your personal email address private when signing up for services online.</li>
                          <li><strong>Spam Prevention:</strong> Avoid cluttering your primary inbox with promotional emails and potential spam.</li>
                          <li><strong>No Registration:</strong> Use our service instantly without creating an account or providing personal information.</li>
                          <li><strong>Security:</strong> Protect yourself from phishing attempts by using disposable emails for untrusted websites.</li>
                          <li><strong>Simplicity:</strong> Our user-friendly interface makes it easy to generate and manage temporary email addresses.</li>
                        </ul>
                      </div>
                      <div className="info-content-column">
                        <h3>How Hide Mail Works</h3>
                        <ol>
                          <li><strong>Generate:</strong> Create a random email address with one click or customize your own.</li>
                          <li><strong>Use:</strong> Provide this email address when signing up for services or newsletters.</li>
                          <li><strong>Receive:</strong> All incoming messages appear instantly in your temporary inbox.</li>
                          <li><strong>Read:</strong> View message content directly in our secure interface.</li>
                          <li><strong>Expire:</strong> After the set period, the email address expires and all data is deleted.</li>
                        </ol>
                        
                        <h3>When to Use Temporary Email</h3>
                        <p>Temporary email addresses are ideal for:</p>
                        <ul>
                          <li>Signing up for free trials or one-time offers</li>
                          <li>Creating accounts on forums or discussion boards</li>
                          <li>Downloading content that requires email verification</li>
                          <li>Testing your own email marketing campaigns</li>
                          <li>Protecting your identity when using public Wi-Fi</li>
                        </ul>
                      </div>
                    </div>
                    
                    <div className="faq-section">
                      <h3>Frequently Asked Questions</h3>
                      <div className="faq-grid">
                        <div className="faq-item">
                          <h4>Is Hide Mail completely free?</h4>
                          <p>Yes, Hide Mail is 100% free to use with no hidden fees or premium features. We're supported by non-intrusive advertisements.</p>
                        </div>
                        <div className="faq-item">
                          <h4>How long do temporary emails last?</h4>
                          <p>Our temporary email addresses remain active for 24 hours by default. After this period, all messages and the email address itself are permanently deleted.</p>
                        </div>
                        <div className="faq-item">
                          <h4>Can I send emails from my temporary address?</h4>
                          <p>Hide Mail is primarily designed for receiving emails. While some temporary email services offer sending capabilities, our focus is on providing secure, anonymous inboxes for receiving messages.</p>
                        </div>
                        <div className="faq-item">
                          <h4>Is using a temporary email legal?</h4>
                          <p>Yes, using temporary email services is completely legal. However, some websites may block known temporary email domains to prevent abuse.</p>
                        </div>
                        <div className="faq-item">
                          <h4>Can I access my emails after they expire?</h4>
                          <p>No, once the temporary email expires, all associated data is permanently deleted from our servers for security and privacy reasons.</p>
                        </div>
                        <div className="faq-item">
                          <h4>Are temporary emails secure?</h4>
                          <p>Hide Mail uses encryption and secure protocols to protect your data. However, as with any online service, you should avoid sharing sensitive personal information through temporary email addresses.</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="ad-container ad-between-sections">
                      <ContentAwareAd
                        slot="3456789012"
                        format="horizontal"
                        width={728}
                        height={90}
                        position="middle-of-page"
                        contentSelector=".faq-section"
                        minContentLength={300}
                      />
                    </div>
                    
                    <div className="best-practices-section">
                      <h3>Best Practices for Using Temporary Email Services</h3>
                      <div className="best-practices-grid">
                        <div className="best-practice-item">
                          <h4>Do Use For:</h4>
                          <ul>
                            <li>Newsletter subscriptions</li>
                            <li>Forum registrations</li>
                            <li>Free downloads</li>
                            <li>One-time verifications</li>
                            <li>Testing your own applications</li>
                          </ul>
                        </div>
                        <div className="best-practice-item">
                          <h4>Don't Use For:</h4>
                          <ul>
                            <li>Important financial accounts</li>
                            <li>Government services</li>
                            <li>Job applications</li>
                            <li>Long-term business communications</li>
                            <li>Accounts you'll need to recover later</li>
                          </ul>
                        </div>
                      </div>
                      
                      <div className="privacy-tip">
                        <h4>Privacy Tip</h4>
                        <p>For maximum privacy protection, consider using a combination of temporary email addresses and a VPN service when signing up for online services. This provides an additional layer of anonymity by masking both your email identity and IP address.</p>
                      </div>
                    </div>
                    
                    <div className="ad-container ad-before-footer">
                      <ContentAwareAd
                        slot="5678901234"
                        format="horizontal"
                        width={728}
                        height={90}
                        position="before-footer"
                        contentSelector=".best-practices-section"
                        minContentLength={200}
                      />
                    </div>
                  </div>
                </>
              } />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/about-us" element={<AboutUs />} />
              <Route path="/contact-us" element={<ContactUs />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:postId" element={<BlogPost />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
            
            <FooterContainer>
              <FooterLinks className="footer-links">
                <FooterLink to="/privacy-policy" onClick={(e) => e.currentTarget.blur()}>Privacy Policy</FooterLink>
                <FooterLink to="/terms-of-service" onClick={(e) => e.currentTarget.blur()}>Terms of Service</FooterLink>
                <FooterLink to="/about-us" onClick={(e) => e.currentTarget.blur()}>About Us</FooterLink>
                <FooterLink to="/contact-us" onClick={(e) => e.currentTarget.blur()}>Contact Us</FooterLink>
                <FooterLink to="/blog" onClick={(e) => e.currentTarget.blur()}>Blog</FooterLink>
              </FooterLinks>
              <div className="ad-container ad-in-footer">
                <ContentAwareAd
                  slot="6789012345"
                  format="horizontal"
                  width={728}
                  height={90}
                  position="in-footer"
                  contentSelector="footer"
                  minContentLength={50}
                />
              </div>
              <p>&copy; {new Date().getFullYear()} Hide Mail - The friendly temporary email service</p>
              <p>We value your privacy. Hide Mail does not store or share your personal information.</p>
            </FooterContainer>
            
            <CookieConsent />
          </AppContainer>
        </ConfigProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App; 