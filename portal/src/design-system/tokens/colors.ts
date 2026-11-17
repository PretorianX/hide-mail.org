export const colors = {
  primary: '#9C4C16',
  primaryLight: '#F6D9C2',
  primaryDark: '#8F4A14',

  secondary: '#2B2F34',
  secondaryLight: '#4B5560',
  secondaryDark: '#1E242B',

  accent: '#6E8F8A',
  accentLight: '#DCEBE8',
  accentDark: '#4F706C',

  error: '#D32F2F',
  errorLight: '#FEF2F2',
  errorBorder: '#FECACA',
  success: '#1A7A41',
  successLight: '#F0FDF4',
  successBorder: '#BBF7D0',
  warning: '#8A5300',
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',
  info: '#2662A6',
  infoLight: '#EFF6FF',
  infoBorder: '#BFDBFE',

  brand: {
    duckOrange: '#DC7A2A',
    duckOrangeLight: '#EAA66F',
    duckYellow: '#FFDE59',
    duckBlack: '#2B2F34',
    duckGray: '#F5EFE7',
    duckWhite: '#FFFDF8',
  },

  danger: {
    subtle: '#FCECEC',
    light: '#F8CACA',
    base: '#D32F2F',
    strong: '#B71C1C',
  },

  white: '#FFFFFF',
  black: '#000000',

  gray: {
    50: '#FFFDF8',
    100: '#FBF8F3',
    200: '#F5EFE7',
    300: '#E8DED2',
    400: '#CFC5BA',
    500: '#9B948A',
    600: '#746B62',
    700: '#5A5047',
    800: '#3E3933',
    900: '#2B2F34',
  },

  overlay: 'rgba(0, 0, 0, 0.55)',

  background: {
    light: '#FBF8F3',
    dark: '#121620',
  },

  surface: {
    light: '#FFFDF8',
    dark: '#1E2635',
  },

  text: {
    light: {
      primary: '#2B2F34',
      secondary: '#626B73',
      disabled: '#9B948A',
    },
    dark: {
      primary: '#E8EDF2',
      secondary: '#A8B2BD',
      disabled: '#687281',
    },
  },

  border: {
    light: '#DDD6CC',
    dark: '#3A4654',
  },
} as const;

export type Colors = typeof colors;
