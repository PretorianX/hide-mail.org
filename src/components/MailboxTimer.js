import React, { useState, useEffect } from 'react';
import EmailService from '../services/EmailService.js';
import { useLicense } from '../context/LicenseContext';
import ProCta from './ProCta';
import './MailboxTimer.css';

const MailboxTimer = ({ onExpire, onExtend }) => {
  const [timeLeft, setTimeLeft] = useState('30:00');
  const [percentLeft, setPercentLeft] = useState(100);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const { isPro, entitlements } = useLicense();

  useEffect(() => {
    let interval;
    
    const updateTimer = () => {
      const remainingTime = EmailService.getRemainingTime();
      
      if (remainingTime <= 0) {
        clearInterval(interval);
        setTimeLeft('Expired');
        setPercentLeft(0);
        if (onExpire) onExpire();
        return;
      }
      
      const totalMs = remainingTime;
      const days = Math.floor(remainingTime / 86400000);
      const hours = Math.floor((remainingTime % 86400000) / 3600000);
      const minutes = Math.floor((remainingTime % 3600000) / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes.toString().padStart(2, '0')}m`);
      } else {
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }

      const configuredTotal = (entitlements?.mailboxTtlSeconds || 1800) * 1000;
      const percentRemaining = (totalMs / configuredTotal) * 100;
      setPercentLeft(Math.min(percentRemaining, 100));
    };
    
    // Update immediately and then every second
    updateTimer();
    interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [onExpire, entitlements]);

  const handleRefreshTimer = async () => {
    setIsRefreshing(true);
    setRefreshError('');
    const extended = await EmailService.refreshExpirationTime();
    setIsRefreshing(false);

    if (!extended) {
      setRefreshError('Could not extend the mailbox. Please try again.');
      return;
    }
    if (onExtend) onExtend();
  };

  // Free mailboxes are topped up in 15 minute steps; a paid one goes back to its full lifetime.
  const extendLabel = isPro ? 'Reset timer' : 'Add 15 minutes';

  // Determine color based on percentage left
  const getProgressColor = () => {
    if (percentLeft > 50) return 'var(--duck-orange)';
    if (percentLeft > 20) return 'var(--warning-color)';
    return 'var(--danger-color)';
  };

  return (
    <div className="mailbox-timer">
      <div className="timer-header">
        <span className="timer-label">Mailbox expires in:</span>
        <span className="timer-value">{timeLeft}</span>
        <button 
          className="refresh-button"
          onClick={handleRefreshTimer}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Extending...' : extendLabel}
        </button>
      </div>
      {refreshError && <p className="timer-error" role="alert">{refreshError}</p>}
      <div className="timer-progress-container">
        <div 
          className="timer-progress-bar" 
          style={{ 
            width: `${percentLeft}%`,
            backgroundColor: getProgressColor()
          }}
        ></div>
      </div>
      {!isPro && percentLeft > 0 && percentLeft <= 35 && (
        <ProCta compact className="mailbox-timer-pro" />
      )}
    </div>
  );
};

export default MailboxTimer; 