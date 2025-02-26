import React, { useState, useEffect } from 'react';
import './App.css';
import EmailService from './services/EmailService';
import Header from './components/Header';
import EmailDisplay from './components/EmailDisplay';
import MessageList from './components/MessageList';
import MessageView from './components/MessageView';

function App() {
  const [email, setEmail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [domains, setDomains] = useState([]);

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
      const fetchedMessages = await EmailService.getMessages(emailAddress);
      setMessages(fetchedMessages);
      setSelectedMessage(null); // Clear selected message when messages change
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
      setSelectedMessage(null);
    } catch (err) {
      console.error('Error generating email:', err);
      setError('Failed to generate email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMessage = async (messageId) => {
    try {
      setLoading(true);
      const message = await EmailService.getMessageDetails(email, messageId);
      setSelectedMessage(message);
    } catch (err) {
      console.error('Error fetching message details:', err);
      setError('Failed to load message. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      setLoading(true);
      await EmailService.deleteMessage(email, messageId);
      // Refresh messages after deletion
      fetchMessages(email);
    } catch (err) {
      console.error('Error deleting message:', err);
      setError('Failed to delete message. Please try again later.');
    } finally {
      setLoading(false);
    }
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
    setSelectedMessage(null);
    
    // Generate a new email
    handleGenerateEmail();
  };

  return (
    <div className="app">
      <Header 
        email={email} 
        onGenerateEmail={handleGenerateEmail}
        onRefreshMessages={handleRefreshMessages}
        onMailboxExpired={handleMailboxExpired}
      />
      
      {/* Top banner ad */}
      <div className="ad-container">
        <div className="ad-banner">
          Google Ad Banner (728x90)
        </div>
      </div>
      
      <div className="app-layout">
        <div className="main-content">
          <main className="app-content">
            {loading && <div className="loading">Loading...</div>}
            {error && <div className="error">{error}</div>}
            
            {email && (
              <>
                <EmailDisplay email={email} />
                
                <div className="message-container">
                  <MessageList 
                    messages={messages} 
                    onSelectMessage={handleSelectMessage}
                    selectedMessageId={selectedMessage?.id}
                  />
                  
                  {selectedMessage && (
                    <MessageView 
                      message={selectedMessage} 
                      onDelete={() => handleDeleteMessage(selectedMessage.id)}
                      onBack={() => setSelectedMessage(null)}
                    />
                  )}
                </div>
              </>
            )}
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