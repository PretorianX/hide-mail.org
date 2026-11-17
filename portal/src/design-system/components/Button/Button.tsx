import { ButtonHTMLAttributes, ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const sizeStyles = {
  sm: css`
    height: 36px;
    padding: 0 ${({ theme }) => theme.spacing.md};
    font-size: ${({ theme }) => theme.typography.fontSize.sm};
  `,
  md: css`
    height: 44px;
    padding: 0 ${({ theme }) => theme.spacing.xl};
    font-size: ${({ theme }) => theme.typography.fontSize.md};
  `,
  lg: css`
    height: 52px;
    padding: 0 ${({ theme }) => theme.spacing['2xl']};
    font-size: ${({ theme }) => theme.typography.fontSize.lg};
  `,
};

const variantStyles = {
  primary: css`
    background: linear-gradient(180deg, ${({ theme }) => theme.colors.brand.duckOrangeLight} 0%, ${({ theme }) => theme.colors.primary} 100%);
    color: #fff;
    border: 1px solid transparent;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);

    &:hover:not(:disabled) {
      background: linear-gradient(180deg, ${({ theme }) => theme.colors.brand.duckOrangeLight} 0%, ${({ theme }) => theme.colors.primaryDark} 100%);
      box-shadow: 0 4px 12px rgba(220, 122, 42, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      background: ${({ theme }) => theme.colors.primaryDark};
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  `,
  secondary: css`
    background: ${({ theme }) => adaptiveColor(theme, 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F3 100%)', 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)')};
    color: ${({ theme }) => theme.colors.text.primary};
    border: 1px solid ${({ theme }) => theme.colors.border};
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), inset 0 1px 0 ${({ theme }) => adaptiveColor(theme, 'rgba(255, 255, 255, 0.6)', 'rgba(255,255,255,0.05)')};

    &:hover:not(:disabled) {
      background: ${({ theme }) => adaptiveColor(theme, 'linear-gradient(180deg, #FFFFFF 0%, #F5EFE7 100%)', 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)')};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 ${({ theme }) => adaptiveColor(theme, 'rgba(255, 255, 255, 0.8)', 'rgba(255,255,255,0.1)')};
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      background: ${({ theme }) => adaptiveColor(theme, '#F5EFE7', 'rgba(255,255,255,0.02)')};
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
    }
  `,
  ghost: css`
    background: transparent;
    color: ${({ theme }) => theme.colors.text.primary};
    box-shadow: none;
    border: 1px solid transparent;

    &:hover:not(:disabled) {
      background: ${({ theme }) => adaptiveColor(theme, theme.colors.primaryLight, 'rgba(255, 255, 255, 0.06)')};
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      background: ${({ theme }) => adaptiveColor(theme, '#EBCAB0', 'rgba(255, 255, 255, 0.1)')};
    }
  `,
  danger: css`
    background: linear-gradient(180deg, ${({ theme }) => theme.colors.danger.light} 0%, ${({ theme }) => theme.colors.danger.base} 100%);
    color: #fff;
    border: 1px solid transparent;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);

    &:hover:not(:disabled) {
      background: linear-gradient(180deg, ${({ theme }) => theme.colors.danger.light} 0%, ${({ theme }) => theme.colors.danger.strong} 100%);
      box-shadow: 0 4px 12px rgba(211, 47, 47, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      background: ${({ theme }) => theme.colors.danger.strong};
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  `,
};

const StyledButton = styled.button<{
  $variant: ButtonVariant;
  $size: ButtonSize;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  line-height: 1;
  letter-spacing: 0.01em;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    filter: none;
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primaryLight};
    outline-offset: 3px;
  }

  ${({ $variant }) => variantStyles[$variant]}
  ${({ $size }) => sizeStyles[$size]}
`;

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: ButtonProps) {
  return (
    <StyledButton $variant={variant} $size={size} {...props}>
      {children}
    </StyledButton>
  );
}
