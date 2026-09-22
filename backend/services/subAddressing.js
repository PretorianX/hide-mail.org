/**
 * Site addresses: `<mailbox-local-part>.<label>@<domain>` delivers into the mailbox itself, so a
 * visitor can hand a different address to every site without giving up the inbox they already
 * have open.
 *
 * A local part may legitimately contain dots (Pro custom aliases do), so an incoming recipient is
 * matched longest-prefix-first: the fully spelled address wins over any sub-address route.
 */

const SITE_SEPARATOR = '.';
const SITE_LABEL_MAX_LENGTH = 24;

// Bounds the Redis lookups one recipient can trigger.
const MAX_ROUTE_CANDIDATES = 5;

const SITE_LABEL_PATTERN = new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,${SITE_LABEL_MAX_LENGTH - 2}}[a-z0-9])?$`);

const splitAddress = (address) => {
  const value = String(address ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');

  if (at <= 0 || at === value.length - 1) {
    return null;
  }

  return { localPart: value.slice(0, at), domain: value.slice(at + 1) };
};

/**
 * Every mailbox this recipient could belong to, most specific first.
 * @param {string} address - Recipient address as the sender spelled it
 * @returns {Array<{mailbox: string, label: string|null}>}
 */
const routeCandidates = (address) => {
  const parts = splitAddress(address);

  if (!parts) {
    return [];
  }

  const segments = parts.localPart.split(SITE_SEPARATOR);
  const candidates = [{ mailbox: `${parts.localPart}@${parts.domain}`, label: null }];

  if (segments.some((segment) => segment === '')) {
    return candidates;
  }

  for (let size = segments.length - 1; size > 0; size -= 1) {
    const base = segments.slice(0, size).join(SITE_SEPARATOR);
    const label = segments.slice(size).join(SITE_SEPARATOR);

    candidates.push({ mailbox: `${base}@${parts.domain}`, label });

    if (candidates.length === MAX_ROUTE_CANDIDATES) {
      break;
    }
  }

  return candidates;
};

const isValidSiteLabel = (label) => SITE_LABEL_PATTERN.test(String(label ?? ''));

/**
 * Turn free text ("Acme Store") into a label the router can read back ("acme-store").
 */
const normalizeSiteLabel = (input) =>
  String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SITE_LABEL_MAX_LENGTH)
    .replace(/-+$/g, '');

const buildSiteAddress = (mailbox, label) => {
  const parts = splitAddress(mailbox);

  if (!parts) {
    throw new Error(`Cannot build a site address from address: ${mailbox}`);
  }

  if (!isValidSiteLabel(label)) {
    throw new Error(`Invalid site address label: ${label}`);
  }

  return `${parts.localPart}${SITE_SEPARATOR}${label}@${parts.domain}`;
};

module.exports = {
  SITE_SEPARATOR,
  SITE_LABEL_MAX_LENGTH,
  MAX_ROUTE_CANDIDATES,
  splitAddress,
  routeCandidates,
  buildSiteAddress,
  normalizeSiteLabel,
  isValidSiteLabel,
};
