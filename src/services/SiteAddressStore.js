import { isValidSiteLabel } from '../utils/siteAddress';

const STORAGE_KEY = 'hidemail.siteAddresses';
const MAX_LABELS_PER_MAILBOX = 50;

const keyFor = (mailbox) => String(mailbox || '').trim().toLowerCase();

const readAll = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
};

const writeAll = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

/**
 * The site address labels a visitor has handed out from a mailbox, newest first.
 *
 * There is no account to hang these on, so they live in the browser next to the mailbox that
 * owns them. Mail routing does not depend on this list — it only remembers what was handed out.
 */
const SiteAddressStore = {
  list(mailbox) {
    const labels = readAll()[keyFor(mailbox)];
    return Array.isArray(labels) ? labels.filter(isValidSiteLabel) : [];
  },

  add(mailbox, label) {
    if (!isValidSiteLabel(label)) {
      return this.list(mailbox);
    }

    const data = readAll();
    const key = keyFor(mailbox);
    const existing = Array.isArray(data[key]) ? data[key] : [];
    const labels = [label, ...existing.filter((item) => item !== label)].slice(
      0,
      MAX_LABELS_PER_MAILBOX
    );

    writeAll({ ...data, [key]: labels });
    return labels;
  },

  remove(mailbox, label) {
    const data = readAll();
    const key = keyFor(mailbox);
    const labels = (Array.isArray(data[key]) ? data[key] : []).filter((item) => item !== label);

    writeAll({ ...data, [key]: labels });
    return labels;
  },

  clear(mailbox) {
    const data = readAll();
    delete data[keyFor(mailbox)];
    writeAll(data);
  },
};

export default SiteAddressStore;
