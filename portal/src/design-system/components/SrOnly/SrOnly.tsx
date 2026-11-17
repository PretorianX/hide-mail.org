import { ReactNode } from 'react';
import styled from 'styled-components';

export interface SrOnlyProps {
  children: ReactNode;
}

const StyledSpan = styled.span`
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

export function SrOnly({ children }: SrOnlyProps) {
  return <StyledSpan>{children}</StyledSpan>;
}
