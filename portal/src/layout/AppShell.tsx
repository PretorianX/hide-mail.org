import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  AdminLayout,
  Button,
  Header,
  HeaderBrandName,
  IconButton,
  InboxIcon,
  MailIcon,
  MenuIcon,
  NavRail,
  SendIcon,
  SettingsIcon,
  SideMenu,
  TrashIcon,
  UserIcon,
  type NavRailItem,
  type SideMenuItem,
} from '@/design-system';
import { clearStoredLicense } from '@/auth/license';

const NAV = [
  { id: '/overview', label: 'Overview', icon: <InboxIcon size={18} /> },
  { id: '/domains', label: 'Domains', icon: <MailIcon size={18} /> },
  { id: '/activity', label: 'Activity', icon: <SendIcon size={18} /> },
  { id: '/suppressions', label: 'Suppressions', icon: <TrashIcon size={18} /> },
  { id: '/api-keys', label: 'API keys', icon: <UserIcon size={18} /> },
  { id: '/metrics', label: 'Metrics', icon: <SettingsIcon size={18} /> },
] as const;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 1100px;
`;

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeId =
    NAV.find((item) => location.pathname === item.id || location.pathname.startsWith(`${item.id}/`))
      ?.id || '/overview';

  const sideItems: SideMenuItem[] = useMemo(
    () => NAV.map((item) => ({ id: item.id, label: item.label, icon: item.icon })),
    [],
  );

  const railItems: NavRailItem[] = useMemo(
    () => NAV.map((item) => ({ id: item.id, label: item.label, icon: item.icon })),
    [],
  );

  const onSelect = (id: string) => {
    setMobileOpen(false);
    navigate(id);
  };

  const lock = () => {
    clearStoredLicense();
    navigate('/unlock', { replace: true });
  };

  return (
    <AdminLayout
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
      mobileMenuTitle="Send"
      header={
        <Header
          logo={
            <Brand>
              <HeaderBrandName>Send</HeaderBrandName>
            </Brand>
          }
          logoHref="/overview"
          mobileActions={
            <IconButton aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <MenuIcon />
            </IconButton>
          }
          actions={
            <Button type="button" variant="ghost" size="sm" onClick={lock}>
              Lock
            </Button>
          }
        />
      }
      sidebar={<SideMenu items={sideItems} activeId={activeId} onSelect={onSelect} />}
      sidebarCollapsed={<NavRail items={railItems} activeId={activeId} onSelect={onSelect} />}
    >
      <Content>
        <Outlet />
      </Content>
    </AdminLayout>
  );
}
