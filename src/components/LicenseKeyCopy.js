import React from 'react';
import PropTypes from 'prop-types';
import './LicenseKeyCopy.css';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CopiedIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const LicenseKeyCopy = ({ licenseKey, copied = false, onCopy, testId }) => (
  <div className={`pro-key-copy ${copied ? 'copied' : ''}`}>
    <code data-testid={testId}>{licenseKey}</code>
    <button
      type="button"
      className={`copy-icon-button ${copied ? 'copied' : ''}`}
      onClick={() => onCopy(licenseKey)}
      aria-label="Copy license key"
      title={copied ? 'Copied!' : 'Copy license key'}
    >
      {copied ? <CopiedIcon /> : <CopyIcon />}
    </button>
    {copied ? (
      <div className="copy-toast" role="status">Copied!</div>
    ) : null}
  </div>
);

LicenseKeyCopy.propTypes = {
  licenseKey: PropTypes.string.isRequired,
  copied: PropTypes.bool,
  onCopy: PropTypes.func.isRequired,
  testId: PropTypes.string.isRequired,
};

export default LicenseKeyCopy;
