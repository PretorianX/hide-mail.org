import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import EmailService from './services/EmailService';
import MailboxTimer from './components/MailboxTimer';
import { parseMultipartMessage } from './utils/messageParser';
import { formatDate } from './utils/dateUtils';

function App() {
  const [email, setEmail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const autoRefreshIntervalRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await EmailService.initialize();
        
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
    try {
      // Don't show loading indicator for auto-refresh to avoid UI flicker
      if (!autoRefreshIntervalRef.current) {
        setLoading(true);
      } else {
        // Show a subtle indicator for auto-refresh
        setRefreshing(true);
      }
      
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
        
        // Normalize date fields
        const normalizedMessage = {
          ...message,
          date: message.date || message.receivedAt || new Date().toISOString()
        };
        
        if (normalizedMessage.body) {
          const parsedContent = parseMultipartMessage(normalizedMessage.body);
          console.log('Parsed content:', parsedContent);
          
          return {
            ...normalizedMessage,
            text: parsedContent.text || normalizedMessage.preview || '',
            html: parsedContent.html || '',
            preview: parsedContent.text || normalizedMessage.preview || ''
          };
        }
        
        return normalizedMessage;
      });
      
      console.log('Processed messages:', processedMessages);
      setMessages(processedMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError('Failed to fetch messages. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleGenerateEmail = async () => {
    try {
      setLoading(true);
      const newEmail = await EmailService.generateEmail();
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
    setError('Your mailbox has expired. Please generate a new email address.');
    setEmail(null);
    setMessages([]);
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
                  <button onClick={handleGenerateEmail}>
                    Generate New Email
                  </button>
                  <button onClick={handleRefreshMessages}>
                    Check Messages
                  </button>
                  <button onClick={sendTestEmail} className="test-email-button">
                    Send Test Email
                  </button>
                  <button 
                    onClick={toggleAutoRefresh} 
                    className={`auto-refresh-button ${autoRefresh ? 'active' : ''}`}
                  >
                    {autoRefresh ? 'Auto-Refresh: ON' : 'Auto-Refresh: OFF'}
                  </button>
                </div>
              </div>
            </section>
            
            <section className="messages-section">
              <div className="messages-header">
                <h2>Duck Mail Inbox</h2>
                {refreshing && <span className="refreshing-indicator">Refreshing...</span>}
              </div>
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
                            {formatDate(message.date || message.receivedAt)}
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