const INVITE_LICENSE_STORAGE_KEY = 'hidemail_invite_license_key';
const API_URL = process.env.REACT_APP_API_URL || '/api';

const jsonHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const readPayload = async (response) => {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || 'Invite Read could not read that meeting request.');
    error.code = payload.code;
    throw error;
  }
  return payload;
};

class InviteService {
  static getKey() {
    try {
      return localStorage.getItem(INVITE_LICENSE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  static saveKey(key) {
    localStorage.setItem(INVITE_LICENSE_STORAGE_KEY, key);
  }

  static clearKey() {
    localStorage.removeItem(INVITE_LICENSE_STORAGE_KEY);
  }

  static async read(source) {
    const response = await fetch(`${API_URL}/invites/report`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ source }),
    });
    const payload = await readPayload(response);
    return payload.report;
  }

  static async loadOffer() {
    const response = await fetch(`${API_URL}/invites/offer`, { headers: jsonHeaders });
    const payload = await readPayload(response);
    return payload.offer;
  }

  static async validate(key) {
    const response = await fetch(`${API_URL}/billing/license/validate`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key }),
    });
    const payload = await readPayload(response);
    const license = payload.license || payload.data;
    if (license?.type !== 'invite' && license?.type !== 'suite') {
      throw new Error('That key is not an Invite Read or Deliverability Suite plan.');
    }
    this.saveKey(license.key);
    return license;
  }

  static async requestApiKey(key) {
    const response = await fetch(`${API_URL}/billing/license/api-key`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key }),
    });
    return readPayload(response);
  }

  static async fetchHandoff(token) {
    const response = await fetch(`${API_URL}/billing/order/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json();
    if (!response.ok || !payload.success || !payload.licenseKey) {
      return null;
    }
    return payload;
  }
}

export default InviteService;
export { INVITE_LICENSE_STORAGE_KEY };
