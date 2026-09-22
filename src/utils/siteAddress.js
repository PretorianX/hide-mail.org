/**
 * Site addresses let one mailbox hand a different address to every site:
 * `<mailbox-local-part>.<label>@<domain>` is delivered into the mailbox itself.
 *
 * The rules mirror `backend/services/subAddressing.js`, which routes the incoming mail.
 */

export const SITE_SEPARATOR = '.';
export const SITE_LABEL_MAX_LENGTH = 24;

const SITE_LABEL_PATTERN = new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,${SITE_LABEL_MAX_LENGTH - 2}}[a-z0-9])?$`);

const splitAddress = (address) => {
  const value = String(address || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');

  if (at <= 0 || at === value.length - 1) {
    return null;
  }

  return { localPart: value.slice(0, at), domain: value.slice(at + 1) };
};

export const isValidSiteLabel = (label) => SITE_LABEL_PATTERN.test(String(label || ''));

/** Turn free text ("Acme Store") into a label the mail router can read back ("acme-store"). */
export const normalizeSiteLabel = (input) =>
  String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SITE_LABEL_MAX_LENGTH)
    .replace(/-+$/g, '');

/** The address to hand out, or an empty string when the label or mailbox is unusable. */
export const buildSiteAddress = (mailbox, label) => {
  const parts = splitAddress(mailbox);

  if (!parts || !isValidSiteLabel(label)) {
    return '';
  }

  return `${parts.localPart}${SITE_SEPARATOR}${label}@${parts.domain}`;
};

/** The label a received message arrived on, or null when it went to the mailbox itself. */
export const siteLabelOf = (deliveredTo, mailbox) => {
  const delivered = splitAddress(deliveredTo);
  const parts = splitAddress(mailbox);

  if (!delivered || !parts || delivered.domain !== parts.domain) {
    return null;
  }

  const prefix = `${parts.localPart}${SITE_SEPARATOR}`;

  return delivered.localPart.startsWith(prefix) ? delivered.localPart.slice(prefix.length) : null;
};
