import { colors } from '../tokens/colors';
import { typography } from '../tokens/typography';
import { spacing, borderRadius } from '../tokens/spacing';
import { shadows, shadowsDark } from '../tokens/shadows';
import { transitions } from '../tokens/transitions';
import { zIndex } from '../tokens/zIndex';
import { breakpoints } from '../tokens/breakpoints';

const baseTheme = {
  typography,
  spacing,
  borderRadius,
  transitions,
  zIndex,
  breakpoints,
  brand: colors.brand,
};

export const lightTheme = {
  ...baseTheme,
  mode: 'light' as const,
  colors: {
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    primaryDark: colors.primaryDark,
    secondary: colors.secondary,
    secondaryLight: colors.secondaryLight,
    secondaryDark: colors.secondaryDark,
    accent: colors.accent,
    accentLight: colors.accentLight,
    accentDark: colors.accentDark,
    error: colors.error,
    errorLight: colors.errorLight,
    errorBorder: colors.errorBorder,
    success: colors.success,
    successLight: colors.successLight,
    successBorder: colors.successBorder,
    warning: colors.warning,
    warningLight: colors.warningLight,
    warningBorder: colors.warningBorder,
    info: colors.info,
    infoLight: colors.infoLight,
    infoBorder: colors.infoBorder,
    danger: colors.danger,
    background: colors.background.light,
    surface: colors.surface.light,
    overlay: colors.overlay,
    text: {
      primary: colors.text.light.primary,
      secondary: colors.text.light.secondary,
      disabled: colors.text.light.disabled,
    },
    border: colors.border.light,
    gray: colors.gray,
    brand: colors.brand,
  },
  shadows,
};

export const darkTheme = {
  ...baseTheme,
  mode: 'dark' as const,
  colors: {
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    primaryDark: colors.primaryDark,
    secondary: colors.secondary,
    secondaryLight: colors.secondaryLight,
    secondaryDark: colors.secondaryDark,
    accent: colors.accent,
    accentLight: colors.accentLight,
    accentDark: colors.accentDark,
    error: colors.error,
    errorLight: '#2D1B1B',
    errorBorder: '#5C2828',
    success: colors.success,
    successLight: '#1B2D1E',
    successBorder: '#285C32',
    warning: colors.warning,
    warningLight: '#2D2A1B',
    warningBorder: '#5C5028',
    info: colors.info,
    infoLight: '#1B222D',
    infoBorder: '#28405C',
    danger: colors.danger,
    background: colors.background.dark,
    surface: colors.surface.dark,
    overlay: colors.overlay,
    text: {
      primary: colors.text.dark.primary,
      secondary: colors.text.dark.secondary,
      disabled: colors.text.dark.disabled,
    },
    border: colors.border.dark,
    gray: colors.gray,
    brand: colors.brand,
  },
  shadows: shadowsDark,
};

type LightTheme = typeof lightTheme;
type DarkTheme = typeof darkTheme;

interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;
  accent: string;
  accentLight: string;
  accentDark: string;
  error: string;
  errorLight: string;
  errorBorder: string;
  success: string;
  successLight: string;
  successBorder: string;
  warning: string;
  warningLight: string;
  warningBorder: string;
  info: string;
  infoLight: string;
  infoBorder: string;
  danger: LightTheme['colors']['danger'];
  background: string;
  surface: string;
  overlay: string;
  text: { primary: string; secondary: string; disabled: string };
  border: string;
  gray: LightTheme['colors']['gray'];
  brand: LightTheme['colors']['brand'];
}

export interface Theme {
  mode: string;
  typography: LightTheme['typography'];
  spacing: LightTheme['spacing'];
  borderRadius: LightTheme['borderRadius'];
  transitions: LightTheme['transitions'];
  zIndex: LightTheme['zIndex'];
  breakpoints: LightTheme['breakpoints'];
  brand: LightTheme['brand'];
  colors: ThemeColors;
  shadows: LightTheme['shadows'] | DarkTheme['shadows'];
}
