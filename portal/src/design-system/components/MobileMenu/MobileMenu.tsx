import { ReactNode, useEffect } from 'react';
import styled from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndex.sheet};
  background: ${({ theme }) => theme.colors.overlay};
  display: flex;
  align-items: flex-end;
  justify-content: center;
  backdrop-filter: blur(6px);
`;

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-bottom: none;
  border-radius: ${({ theme }) =>
    `${theme.borderRadius['3xl']} ${theme.borderRadius['3xl']} 0 0`};
  max-width: 520px;
  width: 100%;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
`;

const Title = styled.h2`
  margin: 0;
  font-weight: ${({ theme }) => theme.typography.fontWeight.ultra};
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CloseButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  color: ${({ theme }) => theme.colors.text.secondary};
  transition: background ${({ theme }) => theme.transitions.normal};

  &:hover {
    background: ${({ theme }) =>
      adaptiveColor(theme, theme.colors.primaryLight, 'rgba(255,255,255,0.08)')};
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primaryLight};
    outline-offset: 3px;
  }
`;

const PanelBody = styled.div`
  padding: ${({ theme }) => `0 ${theme.spacing.lg} ${theme.spacing.lg}`};
  overflow-y: auto;
  flex: 1;
`;

export function MobileMenu({ open, onClose, title, children }: MobileMenuProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Overlay onClick={onClose} data-testid="mobile-menu-overlay">
      <Panel
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelHeader>
          <Title>{title}</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            ✕
          </CloseButton>
        </PanelHeader>
        <PanelBody tabIndex={0}>{children}</PanelBody>
      </Panel>
    </Overlay>
  );
}
