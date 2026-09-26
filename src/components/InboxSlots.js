import React from 'react';
import PropTypes from 'prop-types';
import ProCta from './ProCta';
import { formatRemaining } from '../utils/formatRemaining';
import './InboxSlots.css';

/**
 * The strip of inboxes this browser is keeping alive. Switching between them is free of charge
 * and free of side effects: nothing is deactivated until the visitor closes it.
 */
const InboxSlots = ({
  slots,
  activeEmail,
  limit,
  isPro,
  opening,
  error,
  onSelect,
  onRelease,
  onOpen,
}) => {
  if (slots.length === 0) {
    return null;
  }

  const full = slots.length >= limit;

  return (
    <div className="inbox-slots">
      <div className="inbox-slots-header">
        <h3 className="inbox-slots-title">Your inboxes</h3>
        <span className="inbox-slots-count">{slots.length} of {limit} open</span>
      </div>

      <ul className="inbox-slot-list">
        {slots.map((slot) => (
          <li
            key={slot.email}
            className={`inbox-slot ${slot.email === activeEmail ? 'is-active' : ''}`}
          >
            <button
              type="button"
              className="inbox-slot-select"
              aria-label={`Read ${slot.email}`}
              aria-current={slot.email === activeEmail ? 'true' : 'false'}
              onClick={() => onSelect(slot)}
            >
              <span className="inbox-slot-address">{slot.email}</span>
              <span className="inbox-slot-remaining">{formatRemaining(slot.remainingSeconds)} left</span>
            </button>
            <button
              type="button"
              className="inbox-slot-close"
              aria-label={`Close ${slot.email}`}
              title="Close this inbox"
              onClick={() => onRelease(slot)}
            >
              ×
            </button>
          </li>
        ))}
        <li className="inbox-slot-new">
          <button
            type="button"
            className="inbox-slot-add"
            onClick={onOpen}
            disabled={opening || full}
          >
            {opening ? 'Opening…' : '+ New inbox'}
          </button>
        </li>
      </ul>

      {full && !isPro && (
        <div className="inbox-slots-note">
          <p>
            A free account keeps {limit} inboxes open at the same time.
            Hide Mail Pro keeps 10, so you can run a whole set of signups side by side.
          </p>
          <ProCta compact />
        </div>
      )}

      {full && isPro && (
        <p className="inbox-slots-note">
          You are using all {limit} inboxes your plan keeps open. Close one to start another.
        </p>
      )}

      {error && <p className="inbox-slots-error" role="alert">{error}</p>}
    </div>
  );
};

InboxSlots.propTypes = {
  slots: PropTypes.arrayOf(PropTypes.shape({
    email: PropTypes.string.isRequired,
    remainingSeconds: PropTypes.number.isRequired,
    lifetimeSeconds: PropTypes.number,
  })).isRequired,
  activeEmail: PropTypes.string,
  limit: PropTypes.number.isRequired,
  isPro: PropTypes.bool,
  opening: PropTypes.bool,
  error: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onRelease: PropTypes.func.isRequired,
  onOpen: PropTypes.func.isRequired,
};

export default InboxSlots;
