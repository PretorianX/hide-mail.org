export function isDark(theme: { mode: string }): boolean {
  return theme.mode === 'dark';
}

export function adaptiveColor(
  theme: { mode: string },
  lightValue: string,
  darkValue: string,
): string {
  return isDark(theme) ? darkValue : lightValue;
}
