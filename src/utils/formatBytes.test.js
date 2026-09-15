import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
  it('reports whole bytes below a kilobyte', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('switches to kilobytes at 1024 bytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(102400)).toBe('100 KB');
  });

  it('switches to megabytes at a mebibyte', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(2621440)).toBe('2.5 MB');
  });

  it('drops a trailing zero decimal', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
