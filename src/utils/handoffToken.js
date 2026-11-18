export const HANDOFF_GLOBAL_KEY = 'hidemail_handoff_token';

/**
 * Extracts a one-time payment handoff token from URL hash or query (if present),
 * moves it into sessionStorage, and strips it from the URL immediately so
 * third-party scripts and browser history never observe it.
 */
export const readHandoffToken = (storageKey = HANDOFF_GLOBAL_KEY) => {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const fromUrl =
    hashParams.get('handoffToken') ||
    hashParams.get('handoff_token') ||
    url.searchParams.get('handoffToken') ||
    url.searchParams.get('handoff_token');

  if (fromUrl) {
    sessionStorage.setItem(storageKey, fromUrl);
    hashParams.delete('handoffToken');
    hashParams.delete('handoff_token');
    url.searchParams.delete('handoffToken');
    url.searchParams.delete('handoff_token');
    const nextHash = hashParams.toString();
    window.history.replaceState({}, '', `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`);
    return fromUrl;
  }

  const stored = sessionStorage.getItem(storageKey);
  if (stored) {
    return stored;
  }

  if (storageKey !== HANDOFF_GLOBAL_KEY) {
    const globalStored = sessionStorage.getItem(HANDOFF_GLOBAL_KEY);
    if (globalStored) {
      sessionStorage.setItem(storageKey, globalStored);
      sessionStorage.removeItem(HANDOFF_GLOBAL_KEY);
      return globalStored;
    }
  }

  return null;
};

export const clearHandoffToken = (storageKey = HANDOFF_GLOBAL_KEY) => {
  sessionStorage.removeItem(storageKey);
  if (storageKey !== HANDOFF_GLOBAL_KEY) {
    sessionStorage.removeItem(HANDOFF_GLOBAL_KEY);
  }
};
