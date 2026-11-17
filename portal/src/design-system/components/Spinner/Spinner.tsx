import styled, { css, keyframes } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
}

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const sizeStyles = {
  sm: css`
    width: 16px;
    height: 16px;
  `,
  md: css`
    width: 24px;
    height: 24px;
  `,
  lg: css`
    width: 36px;
    height: 36px;
  `,
};

const SpinnerCircle = styled.span<{ $size: SpinnerSize }>`
  display: block;
  border: 2px solid ${({ theme }) =>
    adaptiveColor(theme, 'rgba(0,0,0,0.12)', 'rgba(255,255,255,0.15)')};
  border-top-color: ${({ theme }) => theme.colors.primary};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2s;
  }

  ${({ $size }) => sizeStyles[$size]}
`;

const SpinnerContainer = styled.span`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Label = styled.span`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const SrOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
`;

export function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <SpinnerContainer role="status" aria-label={label ?? 'Loading'}>
      <SpinnerCircle $size={size} />
      {label && <Label>{label}</Label>}
      <SrOnly>Loading</SrOnly>
    </SpinnerContainer>
  );
}
