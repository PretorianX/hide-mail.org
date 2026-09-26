import { formatRemaining } from './formatRemaining';

describe('formatRemaining', () => {
  it('reads minutes on a free mailbox', () => {
    expect(formatRemaining(29 * 60)).toBe('29m');
  });

  it('reads hours and minutes once there is more than an hour', () => {
    expect(formatRemaining(5 * 3600 + 10 * 60)).toBe('5h 10m');
  });

  it('reads days and hours on a long Pro mailbox', () => {
    expect(formatRemaining(6 * 86400 + 23 * 3600)).toBe('6d 23h');
  });

  it('drops the smaller unit when it is zero', () => {
    expect(formatRemaining(2 * 3600)).toBe('2h');
    expect(formatRemaining(3 * 86400)).toBe('3d');
  });

  it('never claims zero minutes while there is time left', () => {
    expect(formatRemaining(45)).toBe('under a minute');
  });

  it('says the mailbox is gone when nothing is left', () => {
    expect(formatRemaining(0)).toBe('expired');
    expect(formatRemaining(-2)).toBe('expired');
  });
});
