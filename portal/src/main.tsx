import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';
import { PORTAL_BASE_PATH } from '@/basePath';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={PORTAL_BASE_PATH}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

