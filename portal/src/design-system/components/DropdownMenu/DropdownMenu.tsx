import {
  ReactNode,
  ReactElement,
  cloneElement,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  Children,
  isValidElement,
} from 'react';
import styled from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

/* ------------------------------------------------------------------ */
/*  Public types                                                      */
/* ------------------------------------------------------------------ */

export interface DropdownMenuProps {
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'end' | 'center';
}

export type DropdownMenuItemVariant = 'default' | 'danger';

export interface DropdownMenuItemProps {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  shortcut?: string;
  variant?: DropdownMenuItemVariant;
  selected?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuSectionProps {
  title: string;
  children: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Styled primitives                                                 */
/* ------------------------------------------------------------------ */

const Anchor = styled.div`
  display: inline-flex;
  position: relative;
`;

const Panel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  max-width: 320px;
  max-height: 360px;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.xs} 0;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  border: 1px solid
    ${({ theme }) =>
      adaptiveColor(theme, 'rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)')};
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  outline: none;
`;

const ItemButton = styled.button<{
  $variant: DropdownMenuItemVariant;
  $disabled: boolean;
}>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  cursor: ${({ $disabled }) => ($disabled ? 'default' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.4 : 1)};
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
  color: ${({ theme, $variant }) =>
    $variant === 'danger' ? theme.colors.error : theme.colors.text.primary};
  border-radius: 0;
  transition: background 0.12s ease;
  outline: none;

  &:hover:not([disabled]),
  &:focus-visible {
    background: ${({ theme, $variant }) =>
      $variant === 'danger'
        ? adaptiveColor(
            theme,
            'rgba(231,76,60,0.06)',
            'rgba(231,76,60,0.12)',
          )
        : adaptiveColor(
            theme,
            'rgba(0,0,0,0.04)',
            'rgba(255,255,255,0.06)',
          )};
  }
`;

const IconSlot = styled.span`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  opacity: 0.7;
`;

const LabelSlot = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ShortcutSlot = styled.span`
  flex-shrink: 0;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.text.disabled};
  letter-spacing: 0.02em;
`;

const CheckSlot = styled.span`
  width: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.primary};
`;

const DividerLine = styled.hr`
  margin: ${({ theme }) => `${theme.spacing.xs} 0`};
  border: none;
  height: 1px;
  background: ${({ theme }) =>
    adaptiveColor(theme, 'rgba(0,0,0,0.06)', 'rgba(255,255,255,0.06)')};
`;

const SectionTitle = styled.div`
  padding: 8px 14px 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  user-select: none;
`;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

const ITEM_TYPE = Symbol('DropdownMenuItem');
const DIVIDER_TYPE = Symbol('DropdownMenuDivider');
const SECTION_TYPE = Symbol('DropdownMenuSection');

type DropdownMenuChildType =
  | typeof ITEM_TYPE
  | typeof DIVIDER_TYPE
  | typeof SECTION_TYPE;

type DropdownMenuComponentType = {
  __type?: DropdownMenuChildType;
};

type TriggerProps = {
  onClick?: (event: React.MouseEvent) => void;
  'aria-haspopup'?: 'menu';
  'aria-expanded'?: boolean;
};

export function DropdownMenuItem({
  children,
  onSelect,
  icon,
  shortcut,
  variant = 'default',
  selected,
  disabled,
}: DropdownMenuItemProps) {
  return (
    <ItemButton
      role="menuitem"
      type="button"
      $variant={variant}
      $disabled={!!disabled}
      aria-checked={selected ? 'true' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled) onSelect();
        }
      }}
    >
      {selected !== undefined && (
        <CheckSlot aria-hidden>{selected ? '✓' : ''}</CheckSlot>
      )}
      {icon && <IconSlot aria-hidden>{icon}</IconSlot>}
      <LabelSlot>{children}</LabelSlot>
      {shortcut && <ShortcutSlot>{shortcut}</ShortcutSlot>}
    </ItemButton>
  );
}
(DropdownMenuItem as typeof DropdownMenuItem & DropdownMenuComponentType).__type =
  ITEM_TYPE;

export function DropdownMenuDivider() {
  return <DividerLine role="separator" />;
}
(DropdownMenuDivider as typeof DropdownMenuDivider & DropdownMenuComponentType).__type =
  DIVIDER_TYPE;

export function DropdownMenuSection({
  title,
  children,
}: DropdownMenuSectionProps) {
  return (
    <div role="group" aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}
(DropdownMenuSection as typeof DropdownMenuSection & DropdownMenuComponentType).__type =
  SECTION_TYPE;

/* ------------------------------------------------------------------ */
/*  Root component                                                    */
/* ------------------------------------------------------------------ */

export function DropdownMenu({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  align = 'start',
}: DropdownMenuProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;

  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: MouseEvent) => {
      if (
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, close]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current || !anchorRef.current) return;

    const panel = panelRef.current;
    const anchor = anchorRef.current;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const pad = 8;

    panel.style.left = '';
    panel.style.right = '';

    if (align === 'end') {
      const rightEdge = anchorRect.right;
      const leftOverflow = rightEdge - panelRect.width;
      if (leftOverflow < pad) {
        panel.style.left = '0';
      } else {
        panel.style.right = '0';
      }
    } else if (align === 'center') {
      const centerX = anchorRect.left + anchorRect.width / 2;
      let left = centerX - panelRect.width / 2 - anchorRect.left;
      const absLeft = anchorRect.left + left;
      if (absLeft < pad) left += pad - absLeft;
      if (absLeft + panelRect.width > vw - pad) {
        left -= absLeft + panelRect.width - (vw - pad);
      }
      panel.style.left = `${left}px`;
    } else {
      const rightOverflow =
        anchorRect.left + panelRect.width - (vw - pad);
      if (rightOverflow > 0) {
        panel.style.left = '';
        panel.style.right = '0';
      } else {
        panel.style.left = '0';
      }
    }
  }, [open, align]);

  function collectMenuItems(): HTMLElement[] {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
  }

  function handlePanelKeyDown(e: React.KeyboardEvent) {
    const items = collectMenuItems();
    if (!items.length) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    const active = document.activeElement as HTMLElement;
    const idx = items.indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1);
      items[next].focus();
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx <= 0 ? 0 : idx - 1;
      items[prev].focus();
    }
  }

  function handleItemClick(child: ReactElement) {
    const original = child.props as DropdownMenuItemProps;
    if (original.disabled) return;
    original.onSelect();
    close();
  }

  function wrapChildren(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (!isValidElement(child)) return child;

      const ctor = child.type as DropdownMenuComponentType;

      if (ctor.__type === ITEM_TYPE) {
        return cloneElement(child as ReactElement<DropdownMenuItemProps>, {
          onSelect: () => handleItemClick(child as ReactElement),
        });
      }

      if (ctor.__type === SECTION_TYPE) {
        const sectionProps = child.props as DropdownMenuSectionProps;
        return (
          <DropdownMenuSection title={sectionProps.title}>
            {wrapChildren(sectionProps.children)}
          </DropdownMenuSection>
        );
      }

      return child;
    });
  }

  return (
    <Anchor ref={anchorRef}>
      {cloneElement(trigger as ReactElement<TriggerProps>, {
        onClick: (e: React.MouseEvent) => {
          (trigger.props as TriggerProps).onClick?.(e);
          setOpen(!open);
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })}
      {open && (
        <Panel
          ref={panelRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
        >
          {wrapChildren(children)}
        </Panel>
      )}
    </Anchor>
  );
}
