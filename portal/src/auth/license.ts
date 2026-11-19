const STORAGE_KEY = 'hm_outbound_license';

/** Loose HM-XXXX-XXXX-XXXX-XXXX check before probing the API. */
const LICENSE_RE = /^HM-[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/i;

export function isLicenseFormatValid(key: string): boolean {
  return LICENSE_RE.test(key.trim());
}

export function getStoredLicense(): string | null {
  const sessionValue = sessionStorage.getItem(STORAGE_KEY);
  if (sessionValue && sessionValue.trim()) {
    // Ensure any legacy persistent localStorage value is removed
    localStorage.removeItem(STORAGE_KEY);
    return sessionValue.trim();
  }

  // One-time migration from legacy localStorage to sessionStorage
  const legacyValue = localStorage.getItem(STORAGE_KEY);
  if (legacyValue) {
    localStorage.removeItem(STORAGE_KEY);
    const trimmed = legacyValue.trim();
    if (trimmed) {
      sessionStorage.setItem(STORAGE_KEY, trimmed);
      return trimmed;
    }
  }

  return null;
}

export function setStoredLicense(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key.trim());
  localStorage.removeItem(STORAGE_KEY);
}

export function clearStoredLicense(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };
