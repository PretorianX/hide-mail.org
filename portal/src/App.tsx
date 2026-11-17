import { MailDuckThemeProvider } from '@/design-system';
import { AppRouter } from '@/router';

export function App() {
  return (
    <MailDuckThemeProvider defaultMode="light">
      <AppRouter />
    </MailDuckThemeProvider>
  );
}
