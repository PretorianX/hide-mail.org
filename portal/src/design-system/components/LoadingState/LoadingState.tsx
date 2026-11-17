import styled, { keyframes } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export interface LoadingStateProps {
  message?: string;
}

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => `${theme.spacing.xl} ${theme.spacing.lg}`};
  gap: ${({ theme }) => theme.spacing.md};
`;

const Spinner = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid ${({ theme }) =>
    adaptiveColor(theme, 'rgba(0,0,0,0.12)', 'rgba(255,255,255,0.15)')};
  border-top-color: ${({ theme }) => theme.colors.primary};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const Message = styled.p`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  margin: 0;
`;

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <Container role="status" aria-live="polite">
      <Spinner />
      <Message>{message}</Message>
    </Container>
  );
}
