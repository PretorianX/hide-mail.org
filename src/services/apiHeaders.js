import LicenseService from './LicenseService';

export const jsonHeaders = () => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

/**
 * The license key is the only credential this product has, so every request that can behave
 * differently for a paying visitor carries it.
 */
export const licenseHeaders = () => {
  const headers = jsonHeaders();
  const key = LicenseService.getKey();
  if (key) {
    headers['X-License-Key'] = key;
  }
  return headers;
};

/**
 * Requests that act on a set of concurrent inboxes also carry the group that owns them.
 *
 * @param {string} groupId - Inbox group minted by the API
 */
export const inboxGroupHeaders = (groupId) => ({
  ...licenseHeaders(),
  'X-Inbox-Group': groupId,
});
