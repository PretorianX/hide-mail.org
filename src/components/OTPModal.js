/**
 * OTPModal Component for Forward & Forget Feature
 * 
 * Privacy-focused modal for destination email validation via OTP.
 * Two-step flow: email entry → OTP verification
 * 
 * Privacy Note: OTP validation is per temporary mailbox.
 * Each new temporary address requires fresh validation.
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './OTPModal.css';

const OTPModal = ({ 
  isOpen, 
  onClose, 
  onVerified, 
  tempMailbox,
  onRequestOTP,
  onVerifyOTP,
  initialDestination = ''
}) => {
  // Steps: 'email' or 'otp'
  const [step, setStep] = useState('email');
  const [destinationEmail, setDestinationEmail] = useState(initialDestination);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  
  const otpInputRefs = useRef([]);
  const emailInputRef = useRef(null);

  // Focus email input when modal opens
  useEffect(() => {
    if (isOpen && step === 'email' && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [isOpen, step]);

  // Focus first OTP input when step changes
  useEffect(() => {
    if (step === 'otp' && otpInputRefs.current[0]) {
      otpInputRefs.current[0].focus();
    }
  }, [step]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('email');
      setOtp(['', '', '', '', '', '']);
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(destinationEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      await onRequestOTP(tempMailbox, destinationEmail);
      setStep('otp');
      setCountdown(60); // 60 seconds before allowing resend
    } catch (err) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newOtp.every(digit => digit !== '') && value) {
      handleOtpSubmit(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    // Handle paste
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        const digits = text.replace(/\D/g, '').slice(0, 6).split('');
        const newOtp = [...otp];
        digits.forEach((digit, i) => {
          if (i < 6) newOtp[i] = digit;
        });
        setOtp(newOtp);
        if (newOtp.every(d => d !== '')) {
          handleOtpSubmit(newOtp.join(''));
        }
      });
    }
  };

  const handleOtpSubmit = async (otpValue = otp.join('')) => {
    if (otpValue.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onVerifyOTP(tempMailbox, destinationEmail, otpValue);
      onVerified(destinationEmail);
      onClose();
    } catch (err) {
      setError(err.message || 'Invalid verification code');
      setOtp(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (countdown > 0) return;
    
    setError('');
    setLoading(true);
    setOtp(['', '', '', '', '', '']);

    try {
      await onRequestOTP(tempMailbox, destinationEmail);
      setCountdown(60);
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setOtp(['', '', '', '', '', '']);
    setError('');
  };

  if (!isOpen) return null;

  // Use portal to render modal at document body level to avoid z-index issues
  return createPortal(
    <div className="otp-modal-overlay" onClick={onClose}>
      <div className="otp-modal" onClick={e => e.stopPropagation()}>
        <button className="otp-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="otp-modal-header">
          <h2>Forward & Forget</h2>
          <p className="otp-modal-subtitle">
            Save emails to your personal inbox with one click
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="otp-form">
            <div className="otp-form-section">
              <label htmlFor="destination-email">
                Your email address
              </label>
              <p className="otp-form-hint">
                We'll send a verification code to confirm this is your inbox
              </p>
              <input
                ref={emailInputRef}
                id="destination-email"
                type="email"
                value={destinationEmail}
                onChange={e => setDestinationEmail(e.target.value)}
                placeholder="your.email@example.com"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {error && <div className="otp-error">{error}</div>}

            <div className="otp-privacy-note">
              <span className="otp-privacy-icon">🔒</span>
              <span>
                Privacy first: Verification is tied to this temporary mailbox only. 
                No accounts, no tracking.
              </span>
            </div>

            <button 
              type="submit" 
              className="otp-submit-btn"
              disabled={loading || !destinationEmail}
            >
              {loading ? 'Sending...' : 'Send verification code'}
            </button>
          </form>
        ) : (
          <div className="otp-form">
            <div className="otp-form-section">
              <button className="otp-back-btn" onClick={handleBack} type="button">
                ← Change email
              </button>
              <p className="otp-sent-to">
                Code sent to <strong>{destinationEmail}</strong>
              </p>
              <label>Enter verification code</label>
              <div className="otp-inputs">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => otpInputRefs.current[index] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(index, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(index, e)}
                    disabled={loading}
                    className="otp-digit-input"
                    autoComplete="one-time-code"
                  />
                ))}
              </div>
            </div>

            {error && <div className="otp-error">{error}</div>}

            <button
              type="button"
              className="otp-resend-btn"
              onClick={handleResendOTP}
              disabled={countdown > 0 || loading}
            >
              {countdown > 0 
                ? `Resend code in ${countdown}s` 
                : 'Resend verification code'}
            </button>

            <button 
              type="button"
              className="otp-submit-btn"
              onClick={() => handleOtpSubmit()}
              disabled={loading || otp.some(d => d === '')}
            >
              {loading ? 'Verifying...' : 'Verify and enable forwarding'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default OTPModal;

