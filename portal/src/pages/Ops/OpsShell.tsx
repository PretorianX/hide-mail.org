import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  AdminLayout,
  Button,
  Header,
  HeaderBrandName,
  IconButton,
  MenuIcon,
  NavRail,
  SettingsIcon,
  SideMenu,
  UserIcon,
  type NavRailItem,
  type SideMenuItem,
} from '@/design-system';
import { adminLogout } from '@/api/admin';

const NAV = [{ id: '/ops/keys', label: 'Licences', icon: <UserIcon size={18} /> }] as const;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 1200px;
`;

export function OpsShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeId =
    NAV.find((item) => location.pathname === item.id || location.pathname.startsWith(`${item.id}/`))
      ?.id || '/ops/keys';

  const sideItems: SideMenuItem[] = useMemo(
    () => NAV.map((item) => ({ id: item.id, label: item.label, icon: item.icon })),
    [],
  );
  const railItems: NavRailItem[] = useMemo(
    () =>
      NAV.map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon || <SettingsIcon size={18} />,
      })),
    [],
  );

  const onSelect = (id: string) => {
    setMobileOpen(false);
    navigate(id);
  };

  const onLogout = async () => {
    await adminLogout();
    navigate('/ops/login', { replace: true });
  };

  return (
    <AdminLayout
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
      mobileMenuTitle="Ops"
      header={
        <Header
          logo={
            <Brand>
              <HeaderBrandName>Ops</HeaderBrandName>
            </Brand>
          }
          logoHref="/ops/keys"
          mobileActions={
            <IconButton aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <MenuIcon />
            </IconButton>
          }
          actions={
            <Button type="button" variant="ghost" size="sm" onClick={() => void onLogout()}>
              Sign out
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
