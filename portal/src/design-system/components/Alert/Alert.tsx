import { ReactNode } from 'react';
import styled, { css } from 'styled-components';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

export interface AlertProps {
  variant: AlertVariant;
  children: ReactNode;
}

const variantStyles = {
  error: css`
    background: ${({ theme }) => theme.colors.errorLight};
    border: 1px solid ${({ theme }) => theme.colors.errorBorder};
    color: ${({ theme }) => theme.colors.error};
  `,
  success: css`
    background: ${({ theme }) => theme.colors.successLight};
    border: 1px solid ${({ theme }) => theme.colors.successBorder};
    color: ${({ theme }) => theme.colors.success};
  `,
  warning: css`
    background: ${({ theme }) => theme.colors.warningLight};
    border: 1px solid ${({ theme }) => theme.colors.warningBorder};
    color: ${({ theme }) => theme.colors.warning};
  `,
  info: css`
    background: ${({ theme }) => theme.colors.infoLight};
    border: 1px solid ${({ theme }) => theme.colors.infoBorder};
    color: ${({ theme }) => theme.colors.info};
  `,
};

const StyledAlert = styled.div<{ $variant: AlertVariant }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};

  ${({ $variant }) => variantStyles[$variant]}
`;

export function Alert({ variant, children }: AlertProps) {
  return (
    <StyledAlert $variant={variant} role="alert">
      {children}
    </StyledAlert>
  );
}
