const STORAGE_KEY = 'hm_outbound_license';

/** Loose HM-XXXX-XXXX-XXXX-XXXX check before probing the API. */
const LICENSE_RE = /^HM-[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/i;

export function isLicenseFormatValid(key: string): boolean {
  return LICENSE_RE.test(key.trim());
}

export function getStoredLicense(): string | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value && value.trim() ? value.trim() : null;
}

export function setStoredLicense(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearStoredLicense(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };
