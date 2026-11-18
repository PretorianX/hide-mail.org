import {
  clearStoredLicense,
  getStoredLicense,
  setStoredLicense,
  STORAGE_KEY,
} from '@/auth/license';

describe('portal license storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores the license in sessionStorage and never in localStorage', () => {
    setStoredLicense('  HM-AAAA-BBBB-CCCC-DDDD  ');

    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('HM-AAAA-BBBB-CCCC-DDDD');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getStoredLicense()).toBe('HM-AAAA-BBBB-CCCC-DDDD');
  });

  it('migrates and removes any legacy localStorage license value', () => {
    localStorage.setItem(STORAGE_KEY, 'HM-1111-2222-3333-4444');

    expect(getStoredLicense()).toBe('HM-1111-2222-3333-4444');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('HM-1111-2222-3333-4444');
  });

  it('clears both sessionStorage and localStorage', () => {
    sessionStorage.setItem(STORAGE_KEY, 'HM-AAAA-BBBB-CCCC-DDDD');
    localStorage.setItem(STORAGE_KEY, 'HM-AAAA-BBBB-CCCC-DDDD');

    clearStoredLicense();

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getStoredLicense()).toBeNull();
  });
});
