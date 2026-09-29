const GRADE_LICENSE_STORAGE_KEY = 'hidemail_grade_license_key';
const API_URL = process.env.REACT_APP_API_URL || '/api';

const jsonHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const readPayload = async (response) => {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || 'Mail Grade could not read that email.');
    error.code = payload.code;
    throw error;
  }
  return payload;
};

class GradeService {
  static getKey() {
    try {
      return localStorage.getItem(GRADE_LICENSE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  static saveKey(key) {
    localStorage.setItem(GRADE_LICENSE_STORAGE_KEY, key);
  }

  static clearKey() {
    localStorage.removeItem(GRADE_LICENSE_STORAGE_KEY);
  }

  static async grade(source) {
    const response = await fetch(`${API_URL}/grade/report`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ source }),
    });
    const payload = await readPayload(response);
    return payload.report;
  }

  static async loadOffer() {
    const response = await fetch(`${API_URL}/grade/offer`, { headers: jsonHeaders });
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
    if (license?.type !== 'grade') {
      throw new Error('That key is not a Mail Grade plan.');
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

export default GradeService;
export { GRADE_LICENSE_STORAGE_KEY };
