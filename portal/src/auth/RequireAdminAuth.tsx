import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/design-system';
import { adminMe } from '@/api/admin';

export function RequireAdminAuth() {
  const location = useLocation();
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    let cancelled = false;
    adminMe()
      .then(() => {
        if (!cancelled) setState('ok');
      })
      .catch(() => {
        if (!cancelled) setState('fail');
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state === 'loading') return <LoadingState message="Checking admin session…" />;
  if (state === 'fail') {
    return <Navigate to="/ops/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
