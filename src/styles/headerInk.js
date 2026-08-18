/*
 * The header bar is painted with --duck-orange in both themes (#f7941d light, #ff9f30 dark),
 * so its ink is deliberately theme-independent. White ink reads at 2.28:1 / 1.66:1 on that bar;
 * this dark amber reads at 5.03:1 / 5.60:1, so normal-size text clears WCAG 1.4.3 AA.
 * INK_STRONG is used for hover/active/focus so a state change never lightens the ink.
 * The hover wash lightens the bar rather than darkening it, which keeps the dark ink readable.
 */
export const HEADER_INK = '#5c2d00';
export const HEADER_INK_STRONG = '#3d1e00';
export const HEADER_HOVER_WASH = 'rgba(255, 255, 255, 0.28)';
