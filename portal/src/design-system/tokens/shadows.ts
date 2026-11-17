export const shadows = {
  sm: '0 1px 2px rgba(43, 47, 52, 0.06)',
  md: '0 8px 20px rgba(43, 47, 52, 0.08)',
  lg: '0 18px 42px rgba(43, 47, 52, 0.12)',
  xl: '0 24px 70px rgba(43, 47, 52, 0.14)',
  '2xl': '0 32px 90px rgba(43, 47, 52, 0.18)',
  none: 'none',
} as const;

export const shadowsDark = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.32)',
  md: '0 8px 20px rgba(0, 0, 0, 0.38)',
  lg: '0 18px 42px rgba(0, 0, 0, 0.46)',
  xl: '0 24px 70px rgba(0, 0, 0, 0.54)',
  '2xl': '0 32px 90px rgba(0, 0, 0, 0.62)',
  none: 'none',
} as const;

export type Shadows = typeof shadows;
