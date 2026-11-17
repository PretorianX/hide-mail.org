import { ButtonHTMLAttributes, ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export type IconButtonVariant = 'default' | 'danger' | 'accent';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  'aria-label': string;
  children: ReactNode;
}

const sizeStyles = {
  sm: css`
    width: 30px;
    height: 30px;
    font-size: ${({ theme }) => theme.typography.fontSize.xs};
  `,
  md: css`
    width: 36px;
    height: 36px;
    font-size: ${({ theme }) => theme.typography.fontSize.sm};
  `,
  lg: css`
    width: 44px;
    height: 44px;
    font-size: ${({ theme }) => theme.typography.fontSize.md};
  `,
};

const variantStyles = {
  default: css`
    background: ${({ theme }) =>
      adaptiveColor(theme, 'rgba(0, 0, 0, 0.02)', 'rgba(255, 255, 255, 0.04)')};
    color: ${({ theme }) => theme.colors.text.secondary};

    &:hover:not(:disabled) {
      background: ${({ theme }) =>
        adaptiveColor(theme, 'rgba(0, 0, 0, 0.06)', 'rgba(255, 255, 255, 0.1)')};
      color: ${({ theme }) => theme.colors.text.primary};
    }
  `,
  danger: css`
    background: ${({ theme }) => theme.colors.errorLight};
    color: ${({ theme }) => theme.colors.error};

    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.colors.error};
      color: #fff;
    }
  `,
  accent: css`
    background: ${({ theme }) =>
      adaptiveColor(theme, 'rgba(78, 205, 196, 0.08)', 'rgba(78, 205, 196, 0.1)')};
    color: ${({ theme }) => theme.colors.accent};

    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.colors.accent};
      color: #fff;
    }
  `,
};

const StyledIconButton = styled.button<{
  $variant: IconButtonVariant;
  $size: IconButtonSize;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  cursor: pointer;
  transition: all 0.2s ease;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }

  ${({ $variant }) => variantStyles[$variant]}
  ${({ $size }) => sizeStyles[$size]}
`;

export function IconButton({
  variant = 'default',
  size = 'md',
  children,
  ...props
}: IconButtonProps) {
  return (
    <StyledIconButton $variant={variant} $size={size} {...props}>
      {children}
    </StyledIconButton>
  );
}
