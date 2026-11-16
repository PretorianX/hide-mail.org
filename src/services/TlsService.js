const TLS_LICENSE_STORAGE_KEY = 'hidemail_tls_license_key';
const API_URL = process.env.REACT_APP_API_URL || '/api';

const jsonHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const readPayload = async (response) => {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || 'TLS Reports could not read that report.');
    error.code = payload.code;
    throw error;
  }
  return payload;
};

class TlsService {
  static getKey() {
    try {
      return localStorage.getItem(TLS_LICENSE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  static saveKey(key) {
    localStorage.setItem(TLS_LICENSE_STORAGE_KEY, key);
  }

  static clearKey() {
    localStorage.removeItem(TLS_LICENSE_STORAGE_KEY);
  }

  static async read(source) {
    const response = await fetch(`${API_URL}/tls/report`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ source }),
    });
    const payload = await readPayload(response);
    return payload.report;
  }

  static async loadOffer() {
    const response = await fetch(`${API_URL}/tls/offer`, { headers: jsonHeaders });
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
    if (license?.type !== 'tls' && license?.type !== 'suite') {
      throw new Error('That key is not a TLS Reports or Deliverability Suite plan.');
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

export default TlsService;
export { TLS_LICENSE_STORAGE_KEY };
