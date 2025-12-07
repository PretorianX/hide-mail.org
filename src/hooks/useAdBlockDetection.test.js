import { renderHook, act, waitFor } from '@testing-library/react';
import useAdBlockDetection from './useAdBlockDetection';

describe('useAdBlockDetection', () => {
  let originalFetch;
  
  beforeEach(() => {
    originalFetch = global.fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('returns false initially (loading state)', () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    
    const { result } = renderHook(() => useAdBlockDetection());
    
    expect(result.current).toBe(false);
  });

  test('returns true when fetch to ad script fails (adblock detected)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('blocked'));
    
    const { result } = renderHook(() => useAdBlockDetection());
    
    await act(async () => {
      jest.runAllTimers();
    });
    
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  test('detects adblock using bait element method', async () => {
    // Mock fetch to succeed (so we rely on bait element detection)
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    
    // Mock getComputedStyle to return hidden display
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = jest.fn().mockReturnValue({
      display: 'none',
      visibility: 'visible'
    });
    
    const { result } = renderHook(() => useAdBlockDetection());
    
    await act(async () => {
      jest.runAllTimers();
    });
    
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    
    window.getComputedStyle = originalGetComputedStyle;
  });

  test('returns false when no adblock is detected', async () => {
    // Mock fetch to succeed
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    
    // Mock getComputedStyle to return visible element
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = jest.fn().mockReturnValue({
      display: 'block',
      visibility: 'visible'
    });
    
    const { result } = renderHook(() => useAdBlockDetection());
    
    await act(async () => {
      jest.runAllTimers();
    });
    
    // Should remain false since nothing indicates adblock
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
    
    window.getComputedStyle = originalGetComputedStyle;
  });
});
