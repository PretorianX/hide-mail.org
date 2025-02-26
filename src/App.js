import React, { useState, useEffect } from 'react';
import './App.css';
import EmailService from './services/EmailService';
import MailboxTimer from './components/MailboxTimer';
import { parseMultipartMessage } from './utils/messageParser';

function App() {
  const [email, setEmail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [copied, setCopied] = useState(false);

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
        setError('Failed to initialize. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
     
    // Add Google Adsense script (replace with your actual Adsense ID when you have one)
    const script = document.createElement('script');
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOURPUBID';
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
     
    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const fetchMessages = async (emailAddress) => {
    try {
      setLoading(true);
      console.log('Fetching messages for email:', emailAddress);
      
      const fetchedMessages = await EmailService.getMessages(emailAddress);
      console.log('Fetched messages before processing:', fetchedMessages);
      
      if (!fetchedMessages || fetchedMessages.length === 0) {
        console.log('No messages received from API');
        
        // For testing: If no messages are returned, create a test message
        if (process.env.NODE_ENV === 'development') {
          console.log('Adding test message for development');
          const testMessage = {
            id: 'test-1',
            from: '"Test Sender" <test@example.com>',
            subject: 'Test Email Message',
            date: new Date().toISOString(),
            body: `MIME-Version: 1.0
Content-Type: multipart/alternative;
	boundary="b1_test"
Content-Transfer-Encoding: 8bit

This is a multi-part message in MIME format.
--b1_test
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 8bit

Begin nature main church. Admit total very really stock. Whose Congress interview factor.
Close Mr three put first democratic. Money few agree politics break movement either agree.

--b1_test
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 8bit

<html>
<body>
<p>Begin nature main church. Admit total very really stock. Whose Congress interview factor.</p>
<p>Close Mr three put first democratic. Money few agree politics break movement either agree.</p>
</body>
</html>
--b1_test--`
          };
          
          const parsedContent = parseMultipartMessage(testMessage.body);
          const processedTestMessage = {
            ...testMessage,
            text: parsedContent.text || '',
            html: parsedContent.html || '',
            preview: parsedContent.text || ''
          };
          
          setMessages([processedTestMessage]);
          setLoading(false);
          return;
        }
        
        setMessages([]);
        setLoading(false);
        return;
      }
      
      // Process messages to extract better previews
      const processedMessages = fetchedMessages.map(message => {
        console.log('Processing message:', message);
        
        if (message.body) {
          const parsedContent = parseMultipartMessage(message.body);
          console.log('Parsed content:', parsedContent);
          
          return {
            ...message,
            text: parsedContent.text || message.preview || '',
            html: parsedContent.html || '',
            preview: parsedContent.text || message.preview || ''
          };
        }
        
        return message;
      });
      
      console.log('Processed messages:', processedMessages);
      setMessages(processedMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError('Failed to fetch messages. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateEmail = async (domain = null) => {
    try {
      setLoading(true);
      const newEmail = await EmailService.generateEmail(domain);
      setEmail(newEmail);
      setMessages([]);
      setSelectedDomain('');
    } catch (err) {
      console.error('Error generating email:', err);
      setError('Failed to generate email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleDomainChange = (e) => {
    setSelectedDomain(e.target.value);
  };

  const handleGenerateWithDomain = () => {
    handleGenerateEmail(selectedDomain);
  };

  const handleRefreshMessages = () => {
    if (email) {
      fetchMessages(email);
    }
  };

  const handleMailboxExpired = () => {
    // Clear the current email and messages
    setEmail(null);
    setMessages([]);
    
    // Generate a new email
    handleGenerateEmail();
  };

  const handleCopyClick = () => {
    if (!email) return;
    
    // Copy to clipboard
    navigator.clipboard.writeText(email)
      .then(() => {
        // Show copied message
        setCopied(true);
        
        // Reset after 2 seconds
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy email: ', err);
      });
  };

  const testApi = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Test the API endpoint directly
      const apiUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/messages?email=${encodeURIComponent(email)}`;
      console.log('Testing API URL:', apiUrl);
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      console.log('API test response:', data);
      
      if (!response.ok) {
        setError(`API test failed: ${response.status} ${response.statusText}`);
      } else {
        setError(`API test successful. Messages: ${data.messages ? data.messages.length : 0}`);
      }
    } catch (err) {
      console.error('API test error:', err);
      setError(`API test error: ${err.message}`);
    } finally {
      setLoading(false);
    }
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
    <div className="app">
      <header className="app-header">
        <h1>Mail Duck</h1>
        <p>Your friendly temporary email service</p>
      </header>
      
      {/* Top banner ad */}
      <div className="ad-container">
        <div className="ad-banner">
          Google Ad Banner (728x90)
        </div>
      </div>
      
      <div className="app-layout">
        <div className="main-content">
          <main className="app-main">
            {loading && <div className="loading">Loading...</div>}
            {error && <div className="error">{error}</div>}
            
            <section className="email-section">
              <div className="email-container">
                <h2>Your Duck Mail Address</h2>
                
                <div className="domain-selector">
                  <label htmlFor="domain-select">Choose a domain:</label>
                  <select 
                    id="domain-select" 
                    className="domain-select"
                    value={selectedDomain}
                    onChange={handleDomainChange}
                  >
                    <option value="">Random domain</option>
                    {domains.map(domain => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="email-display-row">
                  <div className="email-display">
                    {email || 'Loading...'}
                  </div>
                  <button 
                    className={`copy-button ${copied ? 'copied' : ''}`}
                    onClick={handleCopyClick}
                    disabled={!email}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                
                {email && (
                  <MailboxTimer 
                    email={email} 
                    onExpired={handleMailboxExpired}
                  />
                )}
                
                <div className="email-actions">
                  <button onClick={handleGenerateWithDomain}>
                    Generate New Email
                  </button>
                  <button onClick={handleRefreshMessages}>
                    Check Messages
                  </button>
                  <button onClick={testApi} className="test-api-button">
                    Test API
                  </button>
                  <button onClick={sendTestEmail} className="test-email-button">
                    Send Test Email
                  </button>
                </div>
              </div>
            </section>
            
            <section className="messages-section">
              <h2>Duck Mail Inbox</h2>
              {messages.length > 0 ? (
                <div className="message-list">
                  {messages.map(message => {
                    // Use the full text content without truncation
                    const previewText = message.text || message.preview || '';
                    
                    return (
                      <div key={message.id} className="message-item">
                        <div className="message-header">
                          <div className="message-from">{message.from}</div>
                          <div className="message-date">
                            {new Date(message.date).toLocaleString()}
                          </div>
                        </div>
                        <div className="message-subject">{message.subject}</div>
                        <div className="message-preview">{previewText}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>Your inbox is empty. Messages will appear here when you receive them.</p>
              )}
            </section>
          </main>
        </div>
        
        <div className="sidebar">
          {/* Sidebar ad */}
          <div className="ad-container">
            <div className="ad-sidebar">
              Google Ad (300x250)
            </div>
          </div>
          
          <div className="email-section">
            <h2>Why Use Mail Duck?</h2>
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
      
      {/* Bottom banner ad */}
      <div className="ad-container">
        <div className="ad-banner">
          Google Ad Banner (728x90)
        </div>
      </div>
      
      <footer className="footer">
        <p>© {new Date().getFullYear()} Mail Duck - The friendly temporary email service</p>
        <p>We value your privacy. Mail Duck does not store or share your personal information.</p>
      </footer>
    </div>
  );
}

export default App; 