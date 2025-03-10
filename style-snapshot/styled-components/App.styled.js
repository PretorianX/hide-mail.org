// Styled components from src/App.js
import styled from 'styled-components';
import { Link } from 'react-router-dom';

const AppContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Roboto', sans-serif;
`;

// Add a styled footer component with links
const FooterContainer = styled.footer`
  margin-top: 40px;
  padding: 20px 0;
  border-top: 1px solid #eee;
  text-align: center;
`;

const FooterLinks = styled.div`
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 15px;
`;

const FooterLink = styled(Link)`
  color: #4285f4;
  text-decoration: none;
  
