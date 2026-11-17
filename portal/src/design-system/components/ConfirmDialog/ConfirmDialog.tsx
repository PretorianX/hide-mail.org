import { useEffect } from 'react';
import styled, { css } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndex.confirm};
  background: ${({ theme }) => theme.colors.overlay};
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
`;

const Dialog = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
  border-radius: ${({ theme }) => theme.borderRadius['2xl']};
  max-width: 440px;
  width: 90%;
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows['2xl']};
`;

const Title = styled.h2`
  margin: 0;
  font-weight: ${({ theme }) => theme.typography.fontWeight.ultra};
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Message = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const CancelButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transitions.normal};

  &:hover {
    background: ${({ theme }) =>
      adaptiveColor(theme, 'rgba(0,0,0,0.04)', 'rgba(255,255,255,0.06)')};
  }
`;

const ConfirmButton = styled.button<{ $variant: 'default' | 'danger' }>`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transitions.normal};

  ${({ $variant }) =>
    $variant === 'danger'
      ? css`
          background: ${({ theme }) => theme.colors.danger.base};
          color: ${({ theme }) => theme.colors.gray[50]};

          &:hover {
            background: ${({ theme }) => theme.colors.danger.strong};
          }
        `
      : css`
          background: ${({ theme }) => theme.colors.primary};
          color: ${({ theme }) => theme.colors.gray[50]};

          &:hover {
            background: ${({ theme }) => theme.colors.primaryDark};
          }
        `}
`;

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Overlay onClick={onCancel}>
      <Dialog
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <Title>{title}</Title>
        <Message>{message}</Message>
        <Actions>
          <CancelButton onClick={onCancel}>{cancelLabel}</CancelButton>
          <ConfirmButton $variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </ConfirmButton>
        </Actions>
      </Dialog>
    </Overlay>
  );
}
