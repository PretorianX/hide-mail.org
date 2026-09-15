import { formatLifetime } from './duration';

describe('formatLifetime', () => {
  test('uses minutes for a free mailbox lifetime', () => {
    expect(formatLifetime(1800)).toBe('30 minutes');
    expect(formatLifetime(60)).toBe('1 minute');
  });

  test('uses hours once minutes stop being readable', () => {
    expect(formatLifetime(86400)).toBe('24 hours');
    expect(formatLifetime(7200)).toBe('2 hours');
  });

  test('uses days for the long Pro lifetimes', () => {
    expect(formatLifetime(604800)).toBe('7 days');
    expect(formatLifetime(2592000)).toBe('30 days');
  });

  test('says nothing for a lifetime that is already over', () => {
    expect(formatLifetime(0)).toBe('');
    expect(formatLifetime(-5)).toBe('');
    expect(formatLifetime(undefined)).toBe('');
  });
});
