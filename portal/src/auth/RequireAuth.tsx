import { Navigate, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { getStoredLicense } from '@/auth/license';
import { setUnauthorizedHandler } from '@/api/client';
import { clearStoredLicense } from '@/auth/license';
import { useNavigate } from 'react-router-dom';

export function RequireAuth() {
  const navigate = useNavigate();
  const license = getStoredLicense();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredLicense();
      navigate('/unlock', { replace: true });
    });
    return () => setUnauthorizedHandler(undefined);
  }, [navigate]);

  if (!license) {
    return <Navigate to="/unlock" replace />;
  }

  return <Outlet />;
}
