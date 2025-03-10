import React, { useState, useEffect } from 'react';
import MailboxTimer from './MailboxTimer.js';
import EmailService from '../services/EmailService.js';
import './Header.css';

const Header = ({ email, onGenerateEmail, onRefreshMessages, onMailboxExpired }) => {
  const [domains, setDomains] = useState([]);
  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState('');

  useEffect(() => {
    const loadDomains = async () => {
      const availableDomains = await EmailService.getAvailableDomains();
      setDomains(availableDomains);
    };
    
    loadDomains();
  }, []);

  const handleGenerateClick = () => {
    onGenerateEmail(selectedDomain || null);
  };

  const handleDomainSelect = (domain) => {
    setSelectedDomain(domain);
    onGenerateEmail(domain);
    setShowDomainDropdown(false);
  };

  const handleRefreshClick = async () => {
    setRefreshing(true);
    await onRefreshMessages();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="logo">
          <img src="/logo.svg" alt="Mail Duck Logo" />
          <h1>Mail Duck</h1>
        </div>
        
        <div className="header-actions">
          {email && (
            <>
              <button 
                className="refresh-button"
                onClick={handleRefreshClick}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing...' : 'Refresh Inbox'}
              </button>
              
              <div className="domain-dropdown-container">
                <button 
                  className="generate-button"
                  onClick={handleGenerateClick}
                >
                  Generate New Email
                </button>
                
                <button 
                  className="domain-dropdown-toggle"
                  onClick={() => setShowDomainDropdown(!showDomainDropdown)}
                >
                  ▼
                </button>
                
                {showDomainDropdown && (
                  <div className="domain-dropdown">
                    <div className="domain-dropdown-header">Select Domain</div>
                    {domains.map(domain => (
                      <div 
                        key={domain} 
                        className="domain-option"
                        onClick={() => handleDomainSelect(domain)}
                      >
                        @{domain}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      {email && (
        <MailboxTimer 
          email={email} 
          onExpired={onMailboxExpired}
        />
      )}
    </header>
  );
};

export default Header; 