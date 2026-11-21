/**
 * Color parsing and WCAG contrast for inline email styles.
 * A value we cannot parse is ignored. The check does not invent a color.
 */

const NAMED = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  maroon: [128, 0, 0],
  yellow: [255, 255, 0],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  green: [0, 128, 0],
  aqua: [0, 255, 255],
  teal: [0, 128, 128],
  blue: [0, 0, 255],
  navy: [0, 0, 128],
  fuchsia: [255, 0, 255],
  purple: [128, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  orange: [255, 165, 0],
};

const channel = (value) => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = (rgb) =>
  (0.2126 * channel(rgb[0])) + (0.7152 * channel(rgb[1])) + (0.0722 * channel(rgb[2]));

const contrastRatio = (left, right) => {
  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
};

const clampChannel = (value) => Math.max(0, Math.min(255, value));

const parseColor = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim().toLowerCase();
  if (!text || text === 'transparent' || text === 'inherit' || text === 'currentcolor') {
    return null;
  }
  if (NAMED[text]) {
    return NAMED[text];
  }
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3
      ? hex[1].split('').map((item) => item + item).join('')
      : hex[1];
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ];
  }
  const rgb = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!rgb) {
    return null;
  }
  return [clampChannel(Number(rgb[1])), clampChannel(Number(rgb[2])), clampChannel(Number(rgb[3]))];
};

const colorFromBackground = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value
    .replace(/!important/gi, ' ')
    .replace(/url\([^)]*\)/gi, ' ');
  const tokens = cleaned.split(/[\s,/]+/).filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const parsed = parseColor(tokens[index]);
    if (parsed) {
      return parsed;
    }
  }
  return null;
};

const CSS_INITIAL_PX = 16;

const parseFontSize = (value, parentPx) => {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.replace(/!important/gi, '').trim().toLowerCase().match(/^([0-9]*\.?[0-9]+)\s*(px|pt|em|rem|%)$/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  const unit = match[2];
  if (unit === 'px') {
    return amount;
  }
  if (unit === 'pt') {
    return amount * (96 / 72);
  }
  const base = unit === 'rem' ? CSS_INITIAL_PX : (parentPx || CSS_INITIAL_PX);
  if (unit === 'em' || unit === 'rem') {
    return amount * base;
  }
  return (amount / 100) * base;
};

const FONT_TAG_PX = {
  1: 10,
  2: 13,
  3: 16,
  4: 18,
  5: 24,
  6: 32,
  7: 48,
};

module.exports = {
  parseColor,
  colorFromBackground,
  parseFontSize,
  contrastRatio,
  FONT_TAG_PX,
  CSS_INITIAL_PX,
};
