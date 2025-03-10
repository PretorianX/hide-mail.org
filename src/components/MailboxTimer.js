import React, { useState, useEffect } from 'react';
import EmailService from '../services/EmailService.js';
import './MailboxTimer.css';

const MailboxTimer = ({ onExpire, onExtend }) => {
  const [timeLeft, setTimeLeft] = useState('30:00');
  const [percentLeft, setPercentLeft] = useState(100);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      
      // Calculate minutes and seconds
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      
      // Format time left
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      
      // Calculate percentage left (assuming 30 min total)
      const totalTime = 30 * 60 * 1000; // 30 minutes in milliseconds
      const percentRemaining = (remainingTime / totalTime) * 100;
      setPercentLeft(Math.min(percentRemaining, 100));
    };
    
    // Update immediately and then every second
    updateTimer();
    interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [onExpire]);

  const handleRefreshTimer = () => {
    setIsRefreshing(true);
    try {
      EmailService.refreshExpirationTime();
      if (onExtend) onExtend();
      // Timer will update automatically in the useEffect
    } catch (error) {
      console.error('Error refreshing timer:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

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
          {isRefreshing ? 'Refreshing...' : 'Refresh Timer'}
        </button>
      </div>
      <div className="timer-progress-container">
        <div 
          className="timer-progress-bar" 
          style={{ 
            width: `${percentLeft}%`,
            backgroundColor: getProgressColor()
          }}
        ></div>
      </div>
    </div>
  );
};

export default MailboxTimer; 