const SENDER_LICENSE_STORAGE_KEY = 'hidemail_sender_license_key';
const API_URL = process.env.REACT_APP_API_URL || '/api';

const jsonHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const readPayload = async (response) => {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || 'Sender Check could not look up that domain.');
    error.code = payload.code;
    throw error;
  }
  return payload;
};

class SenderService {
  static getKey() {
    try {
      return localStorage.getItem(SENDER_LICENSE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  static saveKey(key) {
    localStorage.setItem(SENDER_LICENSE_STORAGE_KEY, key);
  }

  static clearKey() {
    localStorage.removeItem(SENDER_LICENSE_STORAGE_KEY);
  }

  static async check(domain) {
    const response = await fetch(`${API_URL}/sender/report`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ domain }),
    });
    const payload = await readPayload(response);
    return payload.report;
  }

  static async loadOffer() {
    const response = await fetch(`${API_URL}/sender/offer`, { headers: jsonHeaders });
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
    if (license?.type !== 'sender') {
      throw new Error('That key is not a Sender Check plan.');
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

export default SenderService;
export { SENDER_LICENSE_STORAGE_KEY };
