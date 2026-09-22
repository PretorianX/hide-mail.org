import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router';
import SiteAddressStore from '../services/SiteAddressStore';
import {
  SITE_LABEL_MAX_LENGTH,
  buildSiteAddress,
  normalizeSiteLabel,
  siteLabelOf,
} from '../utils/siteAddress';
import './SiteAddressPanel.css';

const SiteAddressPanel = ({
  mailbox = '',
  messages = [],
  activeAddress = null,
  onFilterChange = null,
}) => {
  const [siteName, setSiteName] = useState('');
  const [savedLabels, setSavedLabels] = useState(() => SiteAddressStore.list(mailbox));
  const [copiedAddress, setCopiedAddress] = useState(null);

  useEffect(() => {
    setSavedLabels(SiteAddressStore.list(mailbox));
    setSiteName('');
  }, [mailbox]);

  const draftLabel = normalizeSiteLabel(siteName);
  const draftAddress = buildSiteAddress(mailbox, draftLabel);

  const receivedCounts = useMemo(() => {
    const counts = new Map();

    (messages || []).forEach((message) => {
      const label = siteLabelOf(message.deliveredTo, mailbox);
      if (label) {
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    });

    return counts;
  }, [messages, mailbox]);

  // A site address needs no set-up to work, so mail can arrive on one this browser never
  // recorded — a phone, or a second visit. Show those too.
  const labels = useMemo(() => {
    const received = [...receivedCounts.keys()].filter((label) => !savedLabels.includes(label));

    return [...savedLabels, ...received];
  }, [savedLabels, receivedCounts]);

  if (!mailbox) {
    return null;
  }

  const handleCreate = (event) => {
    event.preventDefault();
    setSavedLabels(SiteAddressStore.add(mailbox, draftLabel));
    setSiteName('');
  };

  const handleCopy = (address) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
  };

  const handleForget = (label) => {
    setSavedLabels(SiteAddressStore.remove(mailbox, label));
    if (activeAddress === buildSiteAddress(mailbox, label) && onFilterChange) {
      onFilterChange(null);
    }
  };

  const handleFilter = (address) => {
    if (onFilterChange) {
      onFilterChange(activeAddress === address ? null : address);
    }
  };

  return (
    <section className="site-address-panel" aria-labelledby="site-address-heading">
      <h3 id="site-address-heading">A different address for every site</h3>
      <p className="site-address-intro">
        Anything you put in front of your address lands in this same inbox, so each signup can get
        its own address — and you can see which one a message came in on.
      </p>

      <form className="site-address-form" onSubmit={handleCreate}>
        <label htmlFor="site-address-input">Where are you signing up?</label>
        <div className="site-address-input-row">
          <input
            id="site-address-input"
            className="site-address-input"
            value={siteName}
            onChange={(event) => setSiteName(event.target.value)}
            placeholder="netflix"
            maxLength={SITE_LABEL_MAX_LENGTH * 2}
            autoComplete="off"
          />
          <button type="submit" disabled={!draftAddress}>
            Create address
          </button>
        </div>
        <p className="site-address-preview" data-testid="site-address-preview">
          {draftAddress || `${mailbox.split('@')[0]}.<site>@${mailbox.split('@')[1]}`}
        </p>
      </form>

      {labels.length > 0 && (
        <ul className="site-address-list">
          {labels.map((label) => {
            const address = buildSiteAddress(mailbox, label);
            const count = receivedCounts.get(label) || 0;
            const isActive = activeAddress === address;

            return (
              <li key={label} className={`site-address-item ${isActive ? 'is-active' : ''}`}>
                <span className="site-address-value" data-testid={`site-address-${label}`}>
                  {address}
                </span>
                <span className="site-address-count" data-testid={`site-address-count-${label}`}>
                  {count} {count === 1 ? 'message' : 'messages'}
                </span>
                <span className="site-address-actions">
                  <button
                    type="button"
                    onClick={() => handleCopy(address)}
                    aria-label={`Copy ${address}`}
                  >
                    {copiedAddress === address ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFilter(address)}
                    aria-label={isActive ? 'Show all messages' : `Show only ${address}`}
                  >
                    {isActive ? 'Show all' : 'Filter'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForget(label)}
                    aria-label={`Forget ${address}`}
                  >
                    Forget
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="site-address-footnote">
        Free on every plan. Site addresses live as long as the inbox does, so{' '}
        <Link to="/pro">Hide Mail Pro</Link> keeps one for up to 30 days, under a name you choose.
      </p>
    </section>
  );
};

SiteAddressPanel.propTypes = {
  mailbox: PropTypes.string,
  messages: PropTypes.arrayOf(PropTypes.object),
  activeAddress: PropTypes.string,
  onFilterChange: PropTypes.func,
};

export default SiteAddressPanel;
