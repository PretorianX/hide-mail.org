import { ReactNode } from 'react';
import styled from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export interface NavRailItem {
  id: string;
  icon: ReactNode;
  label: string;
}

export interface NavRailProps {
  items: NavRailItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  logo?: ReactNode;
}

const StyledNav = styled.nav`
  width: 56px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md} 0;
  gap: ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) =>
    adaptiveColor(theme, theme.colors.gray[200], theme.colors.surface)};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
`;

const LogoSlot = styled.div`
  width: 40px;
  height: 40px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledButton = styled.button<{ $active: boolean }>`
  width: 40px;
  height: 40px;
  border: 1px solid transparent;
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primaryLight : 'transparent'};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primaryDark : theme.colors.text.secondary};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${({ theme }) => theme.transitions.normal};

  &:hover {
    background: ${({ theme, $active }) =>
      $active
        ? theme.colors.primaryLight
        : adaptiveColor(theme, 'rgba(255,255,255,0.62)', 'rgba(255,255,255,0.06)')};
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primaryLight};
    outline-offset: 3px;
  }
`;

const IconContainer = styled.span`
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    color: currentColor;
  }
`;

export function NavRail({ items, activeId, onSelect, logo }: NavRailProps) {
  return (
    <StyledNav role="navigation" aria-label="Main navigation">
      {logo && <LogoSlot>{logo}</LogoSlot>}
      {items.map((item) => {
        const isActive = activeId === item.id;
        return (
          <StyledButton
            key={item.id}
            type="button"
            $active={isActive}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <IconContainer>{item.icon}</IconContainer>
          </StyledButton>
        );
      })}
    </StyledNav>
  );
}
