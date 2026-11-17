import { ReactNode } from 'react';
import styled from 'styled-components';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => `${theme.spacing.xl} ${theme.spacing.lg}`};
  text-align: center;
`;

const IconContainer = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 32px;
`;

const Title = styled.h3`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  margin: 0;
`;

const Description = styled.p`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  margin-top: ${({ theme }) => theme.spacing.xs};
  margin-bottom: 0;
`;

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <Container>
      {icon && <IconContainer>{icon}</IconContainer>}
      <Title>{title}</Title>
      {description && <Description>{description}</Description>}
    </Container>
  );
}
