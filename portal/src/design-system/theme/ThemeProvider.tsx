import { ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { ThemeProvider as SCThemeProvider } from 'styled-components';
import { lightTheme, darkTheme, type Theme } from './theme';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface MailDuckThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export function MailDuckThemeProvider({
  children,
  defaultMode = 'light',
}: MailDuckThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(defaultMode);

  const theme: Theme = mode === 'light' ? lightTheme : darkTheme;

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      mode,
      toggleMode: () => setMode((m) => (m === 'light' ? 'dark' : 'light')),
      setMode,
    }),
    [mode],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <SCThemeProvider theme={theme}>{children}</SCThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within a MailDuckThemeProvider');
  }
  return ctx;
}
