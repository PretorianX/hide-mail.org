import { ReactNode } from 'react';
import styled from 'styled-components';
import { media } from '../../tokens/breakpoints';
import { adaptiveColor } from '../../theme/helpers';
import { MobileMenu } from '../MobileMenu';

export interface AdminLayoutProps {
  /** Full sidebar content (e.g. SideMenu). Visible on xl+ desktop and in MobileMenu on mobile. */
  sidebar: ReactNode;
  /** Collapsed sidebar content (e.g. NavRail). Visible on md–lg tablet breakpoint. */
  sidebarCollapsed?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  /** When true, opens the mobile menu (bottom sheet) with sidebar content. Same pattern as UserSpaceLayout. */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  /** Title for the mobile menu sheet. */
  mobileMenuTitle?: string;
}

const SIDEBAR_WIDTH = '260px';
const SIDEBAR_COLLAPSED_WIDTH = '56px';

const LayoutRoot = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr;
  grid-template-areas:
    'header'
    'main';
  height: 100vh;
  background: ${({ theme }) => theme.colors.background};
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};

  ${media.md} {
    grid-template-columns: ${SIDEBAR_COLLAPSED_WIDTH} 1fr;
    grid-template-areas:
      'header header'
      'sidebar main';
  }

  ${media.xl} {
    grid-template-columns: ${SIDEBAR_WIDTH} 1fr;
  }
`;

const HeaderSlot = styled.div`
  grid-area: header;
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.zIndex.sticky};
`;

const SidebarSlot = styled.aside`
  grid-area: sidebar;
  display: none;
  flex-direction: column;
  background: ${({ theme }) =>
    adaptiveColor(theme, theme.colors.gray[200], theme.colors.surface)};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  overflow-y: auto;
  overflow-x: hidden;

  ${media.md} {
    display: flex;
  }
`;

const CollapsedContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;

  ${media.xl} {
    display: none;
  }
`;

const ExpandedContent = styled.div`
  display: none;
  flex-direction: column;
  flex: 1;
  min-height: 0;

  ${media.xl} {
    display: flex;
  }
`;

const Main = styled.main`
  grid-area: main;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.background};
`;

export function AdminLayout(props: AdminLayoutProps) {
  const {
    sidebar,
    sidebarCollapsed,
    header,
    children,
    mobileOpen = false,
    onMobileOpenChange,
    mobileMenuTitle = 'Menu',
  } = props;

  return (
    <LayoutRoot>
      {header && <HeaderSlot>{header}</HeaderSlot>}

      <SidebarSlot aria-hidden={mobileOpen ? "true" : undefined}>
        {sidebarCollapsed && (
          <CollapsedContent>{sidebarCollapsed}</CollapsedContent>
        )}
        <ExpandedContent>{sidebar}</ExpandedContent>
      </SidebarSlot>

      <Main>{children}</Main>

      <MobileMenu
        open={mobileOpen}
        onClose={() => onMobileOpenChange?.(false)}
        title={mobileMenuTitle}
      >
        {sidebar}
      </MobileMenu>
    </LayoutRoot>
  );
}
