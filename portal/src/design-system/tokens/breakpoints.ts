export const breakpoints = {
  sm: '420px',
  md: '768px',
  lg: '880px',
  xl: '1024px',
} as const;

export const media = {
  sm: `@media (max-width: ${breakpoints.sm})`,
  md: `@media (min-width: ${breakpoints.md})`,
  lg: `@media (min-width: ${breakpoints.lg})`,
  xl: `@media (min-width: ${breakpoints.xl})`,
  mobile: `@media (max-width: ${breakpoints.lg})`,
  desktop: `@media (min-width: ${breakpoints.lg})`,
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
} as const;

export type Breakpoints = typeof breakpoints;
