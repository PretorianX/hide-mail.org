/**
 * Human wording for a mailbox or restore key lifetime, in the plainest unit that fits.
 *
 * @param {number} seconds
 * @returns {string} e.g. `30 minutes`, `24 hours`, `7 days`. Empty for a lifetime that is over.
 */
export const formatLifetime = (seconds) => {
  const total = Number(seconds);

  if (!Number.isFinite(total) || total <= 0) {
    return '';
  }

  if (total < 90 * 60) {
    const minutes = Math.max(1, Math.round(total / 60));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  if (total < 48 * 3600) {
    const hours = Math.round(total / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = Math.round(total / 86400);
  return `${days} day${days === 1 ? '' : 's'}`;
};

export default formatLifetime;
