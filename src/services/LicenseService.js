const LICENSE_STORAGE_KEY = 'hidemail_license_key';
const API_URL = process.env.REACT_APP_API_URL || '/api';
const WAYFORPAY_PAYMENT_PREFIX = 'https://secure.wayforpay.com/';

const jsonHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

class LicenseService {
  static getKey() {
    try {
      return localStorage.getItem(LICENSE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  static saveKey(key) {
    localStorage.setItem(LICENSE_STORAGE_KEY, key);
  }

  static clearKey() {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
  }

  static async restore(key) {
    const response = await fetch(`${API_URL}/billing/license/validate`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      const error = new Error(payload.error || 'Unable to restore license');
      error.licenseRejected = response.status === 404;
      throw error;
    }
    const license = payload.license || payload.data;
    this.saveKey(license.key);
    return {
      license,
      entitlements: payload.entitlements || license.entitlements,
    };
  }

  static async restoreSaved() {
    const key = this.getKey();
    if (!key) {
      return null;
    }
    try {
      return await this.restore(key);
    } catch (error) {
      // Only drop the stored key when the server says the license is gone. A network error
      // or a rate limit must not delete the one credential a Pro user has.
      if (error.licenseRejected) {
        this.clearKey();
      }
      return null;
    }
  }

  /**
   * API keys expire after 30 days while the plan runs longer, so a subscriber needs to be able
   * to pull a fresh one using the license key they already hold.
   */
  static async requestApiKey(key) {
    const response = await fetch(`${API_URL}/billing/license/api-key`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Unable to issue an API key');
    }
    return payload;
  }

  static async listPlans() {
    const response = await fetch(`${API_URL}/billing/plans`, { headers: jsonHeaders });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || 'Unable to load plans');
    }
    return payload;
  }

  static async checkout(plan, type = 'pro') {
    const response = await fetch(`${API_URL}/billing/checkout`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ plan, type }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Checkout is unavailable');
    }
    return payload.checkout || payload.data;
  }

  static async fetchPaidOrder(orderReference) {
    const response = await fetch(`${API_URL}/billing/order/${encodeURIComponent(orderReference)}`, {
      headers: jsonHeaders,
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      return null;
    }
    this.saveKey(payload.licenseKey || payload.data?.licenseKey);
    return {
      ...payload,
      licenseKey: payload.licenseKey || payload.data?.licenseKey,
      apiKey: payload.apiKey || payload.data?.apiKey || null,
    };
  }

  static submitWayforpayCheckout(checkout) {
    // The payload is already signed, so it must only ever be posted to WayForPay itself.
    if (!String(checkout.paymentUrl).startsWith(WAYFORPAY_PAYMENT_PREFIX)) {
      throw new Error('Unexpected payment URL');
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = checkout.paymentUrl;
    form.acceptCharset = 'utf-8';

    Object.entries(checkout).forEach(([name, value]) => {
      if (name === 'paymentUrl' || value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = `${name}[]`;
          input.value = String(item);
          form.appendChild(input);
        });
        return;
      }
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }
}

export default LicenseService;
export { LICENSE_STORAGE_KEY };
