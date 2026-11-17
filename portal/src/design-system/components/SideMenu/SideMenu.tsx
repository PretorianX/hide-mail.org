import { ReactNode, useState } from 'react';
import styled from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export interface SideMenuItem {
  id: string;
  icon?: ReactNode;
  label: string;
  badge?: ReactNode;
  action?: ReactNode;
  children?: SideMenuItem[];
}

export interface SideMenuProps {
  items: SideMenuItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  header?: ReactNode;
  defaultExpandedIds?: string[];
}

const StyledNav = styled.nav`
  width: 260px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) =>
    adaptiveColor(theme, theme.colors.gray[200], theme.colors.surface)};
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.md};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
`;

const HeaderSlot = styled.div`
  padding: 0 ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.lg};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ItemsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ItemButton = styled.button<{
  $active: boolean;
  $isChild?: boolean;
}>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  padding: ${({ $isChild, theme }) =>
    $isChild ? `6px ${theme.spacing.md}` : `${theme.spacing.sm} ${theme.spacing.md}`};
  gap: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-size: ${({ theme, $isChild }) =>
    $isChild ? theme.typography.fontSize.sm : theme.typography.fontSize.sm};
  font-weight: ${({ theme, $active }) =>
    $active ? theme.typography.fontWeight.bold : theme.typography.fontWeight.medium};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primaryDark : theme.colors.text.primary};
  transition: all 0.15s ease;

  ${({ $active, theme }) =>
    $active &&
    `
    background: ${theme.colors.primaryLight};
    border-color: ${theme.colors.primaryLight};
  `}

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

const ChildItemButton = styled(ItemButton)<{ $activeChild: boolean }>`
  padding: 6px ${({ theme }) => theme.spacing.md};

  ${({ $activeChild, theme }) =>
    $activeChild &&
    `
    background: ${theme.colors.primaryLight} !important;
    color: ${theme.colors.primaryDark} !important;
    font-weight: ${theme.typography.fontWeight.bold} !important;
  `}

  &:hover {
    background: ${({ theme, $activeChild }) =>
      $activeChild
        ? theme.colors.primaryLight
        : adaptiveColor(theme, 'rgba(255,255,255,0.62)', 'rgba(255,255,255,0.06)')} !important;
  }
`;

const IconSlot = styled.span<{ $active: boolean }>`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${({ $active }) => ($active ? 1 : 0.7)};
`;

const LabelSlot = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const BadgeSlot = styled.span`
  flex-shrink: 0;
`;

const ActionSlot = styled.span`
  flex-shrink: 0;
`;

const Chevron = styled.span<{ $expanded: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  transform: rotate(${({ $expanded }) => ($expanded ? 90 : 0)}deg);
  transition: transform ${({ theme }) => theme.transitions.fast};
  font-size: 12px;
  line-height: 1;
`;

const ChildrenWrapper = styled.div`
  padding-left: 36px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

export function SideMenu({
  items,
  activeId,
  onSelect,
  header,
  defaultExpandedIds = [],
}: SideMenuProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(defaultExpandedIds)
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <StyledNav role="navigation" aria-label="Main Sidebar">
      {header && <HeaderSlot>{header}</HeaderSlot>}
      <ItemsList>
        {items.map((item) => {
          const hasChildren = item.children && item.children.length > 0;
          const isExpanded = expandedIds.has(item.id);
          const isParentActive = activeId === item.id;

          if (hasChildren) {
            return (
              <div key={item.id}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <ItemButton
                    type="button"
                    $active={isParentActive}
                    $isChild={false}
                    aria-label={item.label}
                    aria-expanded={isExpanded}
                    aria-current={isParentActive ? 'page' : undefined}
                    onClick={() => toggleExpanded(item.id)}
                    style={{ paddingRight: 40 }}
                  >
                    {item.icon && (
                      <IconSlot $active={isParentActive}>{item.icon}</IconSlot>
                    )}
                    <LabelSlot>{item.label}</LabelSlot>
                    {item.badge && <BadgeSlot>{item.badge}</BadgeSlot>}
                  </ItemButton>
                  <div style={{ position: 'absolute', right: 12, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <Chevron $expanded={isExpanded}>▸</Chevron>
                  </div>
                </div>
                {isExpanded && (
                  <ChildrenWrapper>
                    {item.children!.map((child) => {
                      const isChildItemActive = activeId === child.id;
                      return (
                        <div key={child.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <ChildItemButton
                            type="button"
                            $active={false}
                            $activeChild={isChildItemActive}
                            $isChild
                            aria-label={child.label}
                            aria-current={isChildItemActive ? 'page' : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(child.id);
                            }}
                            style={{ paddingRight: child.action ? 40 : undefined }}
                          >
                            {child.icon && (
                              <IconSlot $active={isChildItemActive}>
                                {child.icon}
                              </IconSlot>
                            )}
                            <LabelSlot>{child.label}</LabelSlot>
                            {child.badge && <BadgeSlot>{child.badge}</BadgeSlot>}
                          </ChildItemButton>
                          {child.action && (
                            <div style={{ position: 'absolute', right: 12, display: 'flex', alignItems: 'center', zIndex: 1 }}>
                              {child.action}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ChildrenWrapper>
                )}
              </div>
            );
          }

          return (
            <div key={item.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <ItemButton
                type="button"
                $active={isParentActive}
                $isChild={false}
                aria-label={item.label}
                aria-current={isParentActive ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
                style={{ paddingRight: item.action ? 40 : undefined }}
              >
                {item.icon && (
                  <IconSlot $active={isParentActive}>{item.icon}</IconSlot>
                )}
                <LabelSlot>{item.label}</LabelSlot>
                {item.badge && <BadgeSlot>{item.badge}</BadgeSlot>}
              </ItemButton>
              {item.action && (
                <div style={{ position: 'absolute', right: 12, display: 'flex', alignItems: 'center', zIndex: 1 }}>
                  {item.action}
                </div>
              )}
            </div>
          );
        })}
      </ItemsList>
    </StyledNav>
  );
}
