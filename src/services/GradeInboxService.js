import axios from 'axios';
import { getProofOfWork } from '../utils/powSolver';

const API_URL = process.env.REACT_APP_API_URL || '/api';
const STORAGE_KEY = 'hidemail_grade_inbox';

const randomLocalPart = () => {
  const suffix = Math.random().toString(16).slice(2, 10);
  return `grade-${suffix}`;
};

/**
 * Temporary mailbox used only by Mail Grade receive flow.
 * Does not touch EmailService.currentEmail (home inbox).
 */
class GradeInboxService {
  static getStoredAddress() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed?.email || !parsed?.expiresAt) {
        return null;
      }
      if (new Date(parsed.expiresAt) <= new Date()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed.email;
    } catch {
      return null;
    }
  }

  static storeAddress(email, ttlSeconds) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ email, expiresAt }));
  }

  static clearStoredAddress() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  static async createAddress() {
    const domainsResponse = await axios.get(`${API_URL}/domains`, {
      headers: { Accept: 'application/json' },
    });
    const domains = domainsResponse.data.data || [];
    if (!domains.length) {
      throw new Error('No domains available for a Mail Grade address.');
    }
    const domain = domains[0];
    const email = `${randomLocalPart()}@${domain}`;
    const pow = await getProofOfWork();
    const registerResponse = await axios.post(
      `${API_URL}/mailbox/register`,
      { email, pow },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    const ttlSeconds = registerResponse.data?.data?.ttlSeconds || 30 * 60;
    this.storeAddress(email, ttlSeconds);
    return email;
  }

  static async listMessages(email) {
    const response = await axios.get(`${API_URL}/emails/${encodeURIComponent(email)}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.data.success === false) {
      throw new Error(response.data.error || 'Could not list Mail Grade messages.');
    }
    return response.data.data || [];
  }

  static async getRawSource(email, messageId) {
    const response = await axios.get(
      `${API_URL}/emails/${encodeURIComponent(email)}/${encodeURIComponent(messageId)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (response.data.success === false) {
      throw new Error(response.data.error || 'Could not load that message.');
    }
    const message = response.data.data;
    const raw = message?.body || message?.raw;
    if (!raw || typeof raw !== 'string') {
      throw new Error('That message has no raw source to grade.');
    }
    return raw;
  }
}

export default GradeInboxService;
