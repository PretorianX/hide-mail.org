import React, { useState, useEffect } from 'react';
import './App.css';
import EmailService from './services/EmailService';

function App() {
  const [email, setEmail] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    generateEmail();
    
    // Add Google Adsense script (replace with your actual Adsense ID when you have one)
    const script = document.createElement('script');
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOURPUBID';
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
    
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const generateEmail = async () => {
    setLoading(true);
    try {
      const newEmail = await EmailService.generateEmail();
      setEmail(newEmail);
      setMessages([]);
      setError('');
    } catch (err) {
      setError('Failed to generate email address');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const checkMessages = async () => {
    if (!email) return;
    
    setLoading(true);
    try {
      const newMessages = await EmailService.getMessages(email);
      setMessages(newMessages);
      setError('');
    } catch (err) {
      setError('Failed to fetch messages');
      console.error(err);
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
            <section className="email-section">
              <div className="email-container">
                <h2>Your Duck Mail Address</h2>
                <div className="email-display">
                  {loading ? 'Hatching your email...' : email || 'No email generated'}
                </div>
                <div className="email-actions">
                  <button onClick={generateEmail} disabled={loading}>
                    {loading ? 'Generating...' : 'Generate New Duck Mail'}
                  </button>
                  <button onClick={checkMessages} disabled={loading || !email}>
                    Check Messages
                  </button>
                </div>
              </div>
            </section>
            
            {error && <div className="error-message">{error}</div>}
            
            <section className="messages-section">
              <h2>Duck Mail Inbox</h2>
              {messages.length === 0 ? (
                <p>Your inbox is empty. Messages will appear here when you receive them.</p>
              ) : (
                <ul className="message-list">
                  {messages.map((message, index) => (
                    <li key={index} className="message-item">
                      <div className="message-header">
                        <span className="message-from">{message.from}</span>
                        <span className="message-date">{new Date(message.date).toLocaleString()}</span>
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