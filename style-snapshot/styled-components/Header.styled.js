// Styled components from src/components/Header.js
import styled from 'styled-components';
import { Link } from 'react-router-dom';

const HeaderContainer = styled.header`
  background-color: var(--duck-orange);
  padding: 20px 0;
  margin-bottom: 30px;
  text-align: center;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  color: var(--duck-white);
`;

const HeaderContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
`;

const Logo = styled(Link)`
  text-decoration: none;
  color: white;
  display: block;
  text-align: center;
const Nav = styled.nav`
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 15px;
`;

const NavLink = styled(Link)`
  color: white;
  text-decoration: none;
  padding: 5px 10px;
const ParentSite = styled.a`
  font-size: 12px;
  color: #888;
  text-decoration: none;
  display: block;
  margin-top: 5px;
  
  &:hover {
    text-decoration: underline;
  }
`;
