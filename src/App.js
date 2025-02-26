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
        <h1>Temporary Mail Service</h1>
      </header>
      
      <main className="app-main">
        <section className="email-section">
          <div className="email-container">
            <h2>Your Temporary Email</h2>
            <div className="email-display">
              {loading ? 'Loading...' : email || 'No email generated'}
            </div>
            <div className="email-actions">
              <button onClick={generateEmail} disabled={loading}>
                Generate New Email
              </button>
              <button onClick={checkMessages} disabled={loading || !email}>
                Check Messages
              </button>
            </div>
          </div>
        </section>
        
        {error && <div className="error-message">{error}</div>}
        
        <section className="messages-section">
          <h2>Messages</h2>
          {messages.length === 0 ? (
            <p>No messages yet</p>
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
  );
}

export default App; 