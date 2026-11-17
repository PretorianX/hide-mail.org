import { ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { media } from '../../tokens/breakpoints';
import { adaptiveColor } from '../../theme/helpers';

export interface HeaderProps {
  logo: ReactNode;
  /** When set, the logo is wrapped in a link to this href (e.g. "/" for home). */
  logoHref?: string;
  /** Desktop navigation links. Hidden on mobile — use MobileMenu instead. */
  nav?: ReactNode;
  /** Actions shown on desktop. If mobileActions is also provided, these hide on mobile. */
  actions?: ReactNode;
  /** Compact actions for mobile (e.g. hamburger). When set, desktop `actions` hide on mobile. */
  mobileActions?: ReactNode;
  sticky?: boolean;
}

const StyledHeader = styled.header<{ $sticky: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  height: 56px;
  padding: 0 ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  overflow: hidden;

  ${media.md} {
    padding: 0 ${({ theme }) => theme.spacing.xl};
  }

  ${media.desktop} {
    gap: ${({ theme }) => theme.spacing.md};
  }

  ${({ $sticky, theme }) =>
    $sticky &&
    css`
      position: sticky;
      top: 0;
      z-index: ${theme.zIndex.sticky};
      backdrop-filter: blur(12px);
      background: ${adaptiveColor(
        theme,
        'rgba(255, 253, 248, 0.88)',
        'rgba(30,38,53,0.85)',
      )};
    `}
`;

const LogoSlot = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: ${({ theme }) => theme.spacing.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
`;

const LogoLink = styled.a`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: inherit;
  text-decoration: none;
  font-weight: inherit;
  font-size: inherit;

  &:hover {
    color: inherit;
    text-decoration: none;
  }
`;

const Nav = styled.nav`
  display: none;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex: 1;
  min-width: 0;

  a {
    color: ${({ theme }) => theme.colors.text.secondary};
    text-decoration: none;
    font-size: ${({ theme }) => theme.typography.fontSize.sm};
    font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
    padding: 6px ${({ theme }) => theme.spacing.sm};
    border-radius: ${({ theme }) => theme.borderRadius.md};
    transition: color 0.15s ease, background 0.15s ease;
    white-space: nowrap;

    &:hover {
      color: ${({ theme }) => theme.colors.text.primary};
      background: ${({ theme }) =>
        adaptiveColor(
          theme,
          theme.colors.primaryLight,
          'rgba(255,255,255,0.06)',
        )};
    }

    &[aria-current='page'] {
      color: ${({ theme }) => theme.colors.primaryDark};
      font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
    }
  }

  ${media.desktop} {
    display: flex;
  }
`;

const DesktopActions = styled.div`
  display: none;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-shrink: 0;
  margin-left: auto;

  ${media.desktop} {
    display: flex;
  }
`;

const MobileActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-shrink: 0;
  margin-left: auto;

  ${media.desktop} {
    display: none;
  }
`;

/** Rounded brand icon for use inside the `logo` slot. */
export const BrandIcon = styled.img`
  display: block;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  object-fit: contain;
`;

/**
 * Wrap the brand text inside the `logo` slot.
 * Visible on desktop; hidden on mobile so only the icon remains.
 */
export const HeaderBrandName = styled.span`
  display: none;

  ${media.desktop} {
    display: inline;
  }
`;

const ActionsSlot = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-left: auto;
  min-width: 0;

  ${media.desktop} {
    flex-shrink: 0;
  }
`;

export function Header({
  logo,
  logoHref,
  nav,
  actions,
  mobileActions,
  sticky = false,
}: HeaderProps) {
  const hasSeparateMobile = !!mobileActions;
  const logoContent = logoHref ? (
    <LogoLink href={logoHref} aria-label="Home">
      {logo}
    </LogoLink>
  ) : (
    logo
  );

  return (
    <StyledHeader $sticky={sticky}>
      <LogoSlot>{logoContent}</LogoSlot>
      {nav && <Nav>{nav}</Nav>}

      {hasSeparateMobile ? (
        <>
          {actions && <DesktopActions>{actions}</DesktopActions>}
          <MobileActions>{mobileActions}</MobileActions>
        </>
      ) : (
        actions && <ActionsSlot>{actions}</ActionsSlot>
      )}
    </StyledHeader>
  );
}
