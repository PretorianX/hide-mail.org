import { ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export type BadgeVariant = 'default' | 'accent' | 'error' | 'success';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
}

const sizeStyles = {
  sm: css`
    height: 20px;
    min-width: 20px;
    font-size: 11px;
    padding: 0 6px;
  `,
  md: css`
    height: 24px;
    min-width: 24px;
    font-size: 12px;
    padding: 0 8px;
  `,
};

const variantStyles = {
  default: css`
    background: ${({ theme }) =>
      adaptiveColor(theme, 'rgba(0, 0, 0, 0.05)', 'rgba(255, 255, 255, 0.08)')};
    color: ${({ theme }) => theme.colors.text.secondary};
  `,
  accent: css`
    background: ${({ theme }) => theme.colors.primaryLight};
    color: ${({ theme }) => theme.colors.primaryDark};
    border: 1px solid ${({ theme }) => theme.colors.primaryLight};
  `,
  error: css`
    background: ${({ theme }) => theme.colors.errorLight};
    color: ${({ theme }) => theme.colors.error};
  `,
  success: css`
    background: ${({ theme }) => theme.colors.successLight};
    color: ${({ theme }) => theme.colors.success};
  `,
};

const StyledBadge = styled.span<{
  $variant: BadgeVariant;
  $size: BadgeSize;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  line-height: 1;
  white-space: nowrap;
  letter-spacing: 0.02em;

  ${({ $variant }) => variantStyles[$variant]}
  ${({ $size }) => sizeStyles[$size]}
`;

export function Badge({
  variant = 'default',
  size = 'md',
  children,
}: BadgeProps) {
  return (
    <StyledBadge $variant={variant} $size={size}>
      {children}
    </StyledBadge>
  );
}
