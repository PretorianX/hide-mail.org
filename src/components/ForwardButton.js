/**
 * ForwardButton Component for Forward & Forget Feature
 * 
 * One-click button to forward an email to the user's validated destination.
 * Shows different states: ready, requires-validation, limit-reached, sending, sent
 * 
 * Privacy Note: Forwarding saves the email to your personal inbox permanently.
 * No accounts required - just OTP verification per temporary mailbox.
 */

import React, { useState, useEffect, useCallback } from 'react';
import OTPModal from './OTPModal';
import EmailService from '../services/EmailService';
import './ForwardButton.css';

// Button states
const STATES = {
  LOADING: 'loading',
  REQUIRES_VALIDATION: 'requires-validation',
  READY: 'ready',
  SENDING: 'sending',
  SENT: 'sent',
  LIMIT_REACHED: 'limit-reached',
  ERROR: 'error',
};

const ForwardButton = ({ tempMailbox, messageId, onForwarded }) => {
  const [state, setState] = useState(STATES.LOADING);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [forwardingStatus, setForwardingStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  // Fetch forwarding status on mount
  const fetchStatus = useCallback(async () => {
    try {
      const status = await EmailService.getForwardingStatus(tempMailbox);
      setForwardingStatus(status);
      
      if (!status.hasValidatedDestination) {
        setState(STATES.REQUIRES_VALIDATION);
      } else if (!status.rateLimit?.canForward) {
        setState(STATES.LIMIT_REACHED);
      } else {
        setState(STATES.READY);
      }
    } catch (error) {
      console.error('Failed to fetch forwarding status:', error);
      setState(STATES.REQUIRES_VALIDATION);
    }
  }, [tempMailbox]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Reset sent state after delay
  useEffect(() => {
    if (state === STATES.SENT) {
      const timer = setTimeout(() => {
        setState(STATES.READY);
        fetchStatus(); // Refresh status to update remaining forwards
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state, fetchStatus]);

  // Hide toast after delay
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const showNotification = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  // Perform the actual forward operation
  const performForward = async () => {
    setState(STATES.SENDING);
    setErrorMessage('');

    try {
      await EmailService.forwardMessage(tempMailbox, messageId);
      setState(STATES.SENT);
      showNotification('Email forwarded successfully!', 'success');
      onForwarded?.();
      // Refresh status to update remaining forwards count
      fetchStatus();
    } catch (error) {
      console.error('Failed to forward email:', error);
      
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        setState(STATES.LIMIT_REACHED);
        showNotification('Forwarding limit reached for this hour', 'warning');
      } else if (error.code === 'NO_VALIDATED_DESTINATION') {
        setState(STATES.REQUIRES_VALIDATION);
        setShowOTPModal(true);
      } else {
        setState(STATES.ERROR);
        setErrorMessage(error.message || 'Failed to forward email');
        showNotification(error.message || 'Failed to forward email', 'error');
        // Reset to ready state after error
        setTimeout(() => {
          setState(STATES.READY);
        }, 2000);
      }
    }
  };

  const handleClick = async () => {
    if (state === STATES.REQUIRES_VALIDATION) {
      setShowOTPModal(true);
      return;
    }

    if (state === STATES.LIMIT_REACHED) {
      showNotification(
        `Forwarding limit reached. Resets at ${new Date(forwardingStatus?.rateLimit?.resetAt).toLocaleTimeString()}`,
        'warning'
      );
      return;
    }

    if (state !== STATES.READY) {
      return;
    }

    performForward();
  };

  const handleOTPVerified = async (destinationEmail) => {
    showNotification(`Forwarding enabled to ${destinationEmail}`, 'success');
    // Update local state immediately since OTP verification succeeded
    setForwardingStatus(prev => ({
      ...prev,
      hasValidatedDestination: true,
      destinationEmail: destinationEmail
    }));
    setState(STATES.READY);
    // Directly forward without re-checking state (we know OTP just succeeded)
    performForward();
  };

  const handleRequestOTP = async (mailbox, destination) => {
    return EmailService.requestOTP(mailbox, destination);
  };

  const handleVerifyOTP = async (mailbox, destination, otp) => {
    return EmailService.verifyOTP(mailbox, destination, otp);
  };

  const getButtonContent = () => {
    switch (state) {
      case STATES.LOADING:
        return (
          <>
            <span className="forward-btn-spinner"></span>
            <span>Loading...</span>
          </>
        );
      case STATES.REQUIRES_VALIDATION:
        return (
          <>
            <span className="forward-btn-icon">📧</span>
            <span>Forward & Forget</span>
          </>
        );
      case STATES.READY:
        return (
          <>
            <span className="forward-btn-icon">📤</span>
            <span>Forward & Forget</span>
            {forwardingStatus?.rateLimit && (
              <span className="forward-btn-count">
                {forwardingStatus.rateLimit.forwardsRemaining} left
              </span>
            )}
          </>
        );
      case STATES.SENDING:
        return (
          <>
            <span className="forward-btn-spinner"></span>
            <span>Forwarding...</span>
          </>
        );
      case STATES.SENT:
        return (
          <>
            <span className="forward-btn-icon">✓</span>
            <span>Forwarded!</span>
          </>
        );
      case STATES.LIMIT_REACHED:
        return (
          <>
            <span className="forward-btn-icon">⏳</span>
            <span>Limit reached</span>
          </>
        );
      case STATES.ERROR:
        return (
          <>
            <span className="forward-btn-icon">⚠️</span>
            <span>Retry</span>
          </>
        );
      default:
        return <span>Forward & Forget</span>;
    }
  };

  const getButtonClass = () => {
    const classes = ['forward-btn'];
    classes.push(`forward-btn--${state}`);
    return classes.join(' ');
  };

  const getTooltip = () => {
    switch (state) {
      case STATES.REQUIRES_VALIDATION:
        return 'Set up your forwarding destination to save emails to your inbox';
      case STATES.READY:
        return `Forward to ${forwardingStatus?.destinationEmail || 'your inbox'}`;
      case STATES.LIMIT_REACHED:
        return `Limit reached. Resets at ${forwardingStatus?.rateLimit?.resetAt ? new Date(forwardingStatus.rateLimit.resetAt).toLocaleTimeString() : 'next hour'}`;
      case STATES.SENT:
        return 'Email forwarded successfully!';
      default:
        return 'Forward & Forget';
    }
  };

  return (
    <>
      <button 
        className={getButtonClass()}
        onClick={handleClick}
        disabled={state === STATES.LOADING || state === STATES.SENDING || state === STATES.SENT}
        title={getTooltip()}
        aria-label={getTooltip()}
      >
        {getButtonContent()}
      </button>

      {/* Toast notification */}
      {showToast && (
        <div className={`forward-toast forward-toast--${toastType}`}>
          {toastMessage}
        </div>
      )}

      {/* OTP Modal */}
      <OTPModal
        isOpen={showOTPModal}
        onClose={() => setShowOTPModal(false)}
        onVerified={handleOTPVerified}
        tempMailbox={tempMailbox}
        onRequestOTP={handleRequestOTP}
        onVerifyOTP={handleVerifyOTP}
      />
    </>
  );
};

export default ForwardButton;

