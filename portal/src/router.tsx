import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { RequireAdminAuth } from '@/auth/RequireAdminAuth';
import { AppShell } from '@/layout/AppShell';
import { Unlock } from '@/pages/Unlock/Unlock';
import { Overview } from '@/pages/Overview/Overview';
import { Domains } from '@/pages/Domains/Domains';
import { DomainDetail } from '@/pages/Domains/DomainDetail';
import { Activity } from '@/pages/Activity/Activity';
import { Suppressions } from '@/pages/Suppressions/Suppressions';
import { ApiKeys } from '@/pages/ApiKeys/ApiKeys';
import { Metrics } from '@/pages/Metrics/Metrics';
import { OpsLogin } from '@/pages/Ops/OpsLogin';
import { OpsKeys } from '@/pages/Ops/OpsKeys';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/unlock" element={<Unlock />} />
      <Route path="/ops/login" element={<OpsLogin />} />
      <Route element={<RequireAdminAuth />}>
        <Route path="/ops" element={<Navigate to="/ops/keys" replace />} />
        <Route path="/ops/keys" element={<OpsKeys />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/domains" element={<Domains />} />
          <Route path="/domains/:domain" element={<DomainDetail />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/suppressions" element={<Suppressions />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
