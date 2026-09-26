const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/**
 * How much life an inbox has left, short enough to sit inside a chip. Only the two largest
 * units are shown, because the chip is a glance, not a countdown.
 *
 * @param {number} seconds - Seconds remaining on the mailbox lease
 * @returns {string}
 */
export const formatRemaining = (seconds) => {
  const left = Number(seconds);

  if (!Number.isFinite(left) || left <= 0) {
    return 'expired';
  }

  if (left >= DAY) {
    const days = Math.floor(left / DAY);
    const hours = Math.floor((left % DAY) / HOUR);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (left >= HOUR) {
    const hours = Math.floor(left / HOUR);
    const minutes = Math.floor((left % HOUR) / MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (left >= MINUTE) {
    return `${Math.floor(left / MINUTE)}m`;
  }

  return 'under a minute';
};

export default formatRemaining;
