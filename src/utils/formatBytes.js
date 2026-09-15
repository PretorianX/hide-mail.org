const UNITS = ['B', 'KB', 'MB', 'GB'];
const STEP = 1024;

/**
 * Render a byte count the way a file list should read it.
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} - Size with the largest unit that keeps the number above one
 */
export const formatBytes = (bytes) => {
  let value = Number(bytes);
  let unit = 0;

  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }

  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;

  return `${rounded} ${UNITS[unit]}`;
};

export default formatBytes;
