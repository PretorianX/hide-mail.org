const REPORTS_LICENSE_STORAGE_KEY = 'hidemail_reports_license_key';
const API_URL = process.env.REACT_APP_API_URL || '/api';

const jsonHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const readPayload = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.success === false) {
    const error = new Error(
      payload?.error
      || (response.status === 413
        ? 'That report is too large.'
        : 'DMARC Reports could not read that report.')
    );
    error.code = payload?.code;
    throw error;
  }
  return payload;
};

class ReportsService {
  static getKey() {
    try {
      return localStorage.getItem(REPORTS_LICENSE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  static saveKey(key) {
    localStorage.setItem(REPORTS_LICENSE_STORAGE_KEY, key);
  }

  static clearKey() {
    localStorage.removeItem(REPORTS_LICENSE_STORAGE_KEY);
  }

  static async read(xml) {
    const response = await fetch(`${API_URL}/reports/read`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ xml }),
    });
    const payload = await readPayload(response);
    return payload.report;
  }

  static async loadOffer() {
    const response = await fetch(`${API_URL}/reports/offer`, { headers: jsonHeaders });
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
    if (license?.type !== 'reports') {
      throw new Error('That key is not a DMARC Reports plan.');
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
    if (!response.ok || payload.success === false) {
      return null;
    }
    return payload;
  }
}

export default ReportsService;
