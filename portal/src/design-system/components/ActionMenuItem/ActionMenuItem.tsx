import { ButtonHTMLAttributes, ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export type ActionMenuItemVariant = 'default' | 'danger';

export interface ActionMenuItemProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: ActionMenuItemVariant;
  children: ReactNode;
}

const variantStyles = {
  default: css`
    color: ${({ theme }) => theme.colors.text.primary};

    &:hover {
      background: ${({ theme }) =>
        adaptiveColor(theme, 'rgba(0,0,0,0.04)', 'rgba(255,255,255,0.06)')};
    }
  `,
  danger: css`
    color: ${({ theme }) => theme.colors.error};

    &:hover {
      background: ${({ theme }) => theme.colors.errorLight};
    }
  `,
};

const StyledButton = styled.button<{ $variant: ActionMenuItemVariant }>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  font-weight: ${({ theme }) => theme.typography.fontWeight.black};
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  border-radius: ${({ theme }) => theme.borderRadius.xl};
  transition: background ${({ theme }) => theme.transitions.fast};

  ${({ $variant }) => variantStyles[$variant]}
`;

const IconContainer = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
`;

export function ActionMenuItem({
  icon,
  variant = 'default',
  children,
  ...props
}: ActionMenuItemProps) {
  return (
    <StyledButton $variant={variant} role="menuitem" {...props}>
      {icon && <IconContainer>{icon}</IconContainer>}
      {children}
    </StyledButton>
  );
}
