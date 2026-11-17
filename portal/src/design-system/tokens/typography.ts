export const fontFamily = {
  sans: "'Google Sans Variable', 'Google Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Google Sans Variable', 'Google Sans', 'Georgia', ui-serif, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
} as const;

export const fontSize = {
  '2xs': '11px',
  xs: '12px',
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '30px',
  '4xl': '36px',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
  ultra: 950,
} as const;

export const lineHeight = {
  none: 1,
  tight: 1.25,
  snug: 1.35,
  normal: 1.5,
  relaxed: 1.6,
} as const;

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} as const;

export type Typography = typeof typography;
