import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

/**
 * Failures carry the backend's code so the caller can say why, rather than showing a generic
 * message for an expired mailbox and an unknown key alike.
 */
const toError = (error, fallback) => {
  const data = error.response?.data || {};
  const wrapped = new Error(data.error || error.message || fallback);
  wrapped.code = data.code;
  wrapped.httpStatus = error.response?.status;
  return wrapped;
};

/**
 * Restore keys: a short code that reopens a mailbox on another device until it expires.
 * See docs/inbox-restore-key.md.
 */
class RestoreKeyService {
  /**
   * @param {string} email Mailbox to bind the key to.
   * @param {{ rotate?: boolean }} [options] Rotating invalidates the previous key.
   */
  static async issue(email, options = {}) {
    try {
      const response = await axios.post(
        `${API_URL}/mailbox/restore-key`,
        { email, rotate: Boolean(options.rotate) },
        { headers: JSON_HEADERS }
      );
      return response.data.data;
    } catch (error) {
      throw toError(error, 'Could not create a restore key');
    }
  }

  /**
   * @param {string} key Key as the user typed it.
   * @returns {Promise<{ email: string, ttlSeconds: number, expiresAt: string }>}
   */
  static async redeem(key) {
    try {
      const response = await axios.post(
        `${API_URL}/mailbox/restore`,
        { key: String(key).trim() },
        { headers: JSON_HEADERS }
      );
      return response.data.data;
    } catch (error) {
      throw toError(error, 'Could not reopen that inbox');
    }
  }

  /**
   * @param {string} email
   * @returns {Promise<boolean>} True when a key existed and is now gone.
   */
  static async revoke(email) {
    try {
      const response = await axios.delete(`${API_URL}/mailbox/restore-key`, {
        headers: JSON_HEADERS,
        data: { email },
      });
      return Boolean(response.data?.data?.revoked);
    } catch (error) {
      throw toError(error, 'Could not forget the restore key');
    }
  }
}

export default RestoreKeyService;
