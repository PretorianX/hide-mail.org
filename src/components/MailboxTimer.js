import React, { useState, useEffect } from 'react';
import EmailService from '../services/EmailService';

const MailboxTimer = ({ email, onExpired }) => {
  const [remainingTime, setRemainingTime] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!email) return;
    
    // Initialize timer
    setRemainingTime(EmailService.getRemainingTime());
    
    // Update timer every second
    const interval = setInterval(() => {
      const timeLeft = EmailService.getRemainingTime();
      setRemainingTime(timeLeft);
      
      // If expired, notify parent component
      if (timeLeft === 0) {
        if (onExpired) onExpired();
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [email, onExpired]);

  const formatTime = (ms) => {
    if (ms === 0) return 'Expired';
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Refresh expiration time
    const success = EmailService.refreshExpirationTime();
    
    if (success) {
      setRemainingTime(EmailService.getRemainingTime());
    }
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  // Calculate progress percentage
  const totalTime = 30 * 60 * 1000; // 30 minutes in milliseconds
  const progressPercent = Math.min(100, (remainingTime / totalTime) * 100);
  
  // Determine color based on remaining time
  let progressColor = 'var(--duck-orange)';
  if (progressPercent < 30) progressColor = '#ff4d4d';
  else if (progressPercent < 60) progressColor = '#ffa64d';

  return (
    <div className="mailbox-timer">
      <div className="timer-header">
        <span className="timer-label">Mailbox expires in:</span>
        <span className="timer-value">{formatTime(remainingTime)}</span>
        <button 
          className="refresh-button"
          onClick={handleRefresh}
          disabled={isRefreshing || remainingTime === 0}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh Timer'}
        </button>
      </div>
      <div className="timer-progress-container">
        <div 
          className="timer-progress-bar" 
          style={{ 
            width: `${progressPercent}%`,
            backgroundColor: progressColor
          }}
        ></div>
      </div>
    </div>
  );
};

export default MailboxTimer; 