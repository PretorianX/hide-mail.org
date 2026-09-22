const ANGLE_ADDRESS = /<([^<>]+)>/;
const BARE_ADDRESS = /[^\s<>,;"@]+@[^\s<>,;"@]+/;

/**
 * The bare address inside a From header, for display next to a reply box.
 *
 * Display only — the backend derives the address a reply is actually sent to from the stored
 * message, so nothing here decides where mail goes.
 *
 * @param {string} header - A From/Reply-To header such as '"Ada" <ada@shop.test>'
 * @returns {string} - The address, or the header unchanged when none can be found
 */
export const addressOf = (header) => {
  if (typeof header !== 'string') {
    return '';
  }
  const angled = header.match(ANGLE_ADDRESS);
  if (angled) {
    return angled[1].trim();
  }
  const bare = header.match(BARE_ADDRESS);
  return bare ? bare[0] : header.trim();
};
