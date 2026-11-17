import { HTMLAttributes, ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export type CardVariant = 'default' | 'elevated';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantStyles = {
  default: css`
    box-shadow: ${({ theme }) => theme.shadows.sm};
    border: 1px solid ${({ theme }) => theme.colors.border};
  `,
  elevated: css`
    box-shadow: ${({ theme }) => theme.shadows.md};
    border: 1px solid ${({ theme }) =>
      adaptiveColor(theme, theme.colors.border, 'rgba(255, 255, 255, 0.08)')};

    &:hover {
      box-shadow: ${({ theme }) => theme.shadows.lg};
    }
  `,
};

const paddingMap = {
  sm: css`
    padding: ${({ theme }) => theme.spacing.md};
  `,
  md: css`
    padding: ${({ theme }) => theme.spacing.lg};
  `,
  lg: css`
    padding: ${({ theme }) => theme.spacing.xl};
  `,
};

const StyledCard = styled.div<{
  $variant: CardVariant;
  $padding: 'sm' | 'md' | 'lg';
}>`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl};
  transition: box-shadow 0.25s ease, transform 0.25s ease;

  ${({ $variant }) => variantStyles[$variant]}
  ${({ $padding }) => paddingMap[$padding]}
`;

export function Card({
  variant = 'default',
  padding = 'md',
  children,
  ...props
}: CardProps) {
  return (
    <StyledCard $variant={variant} $padding={padding} {...props}>
      {children}
    </StyledCard>
  );
}
