import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const HeaderContainer = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  margin-bottom: 30px;
  border-bottom: 1px solid var(--border-color);
`;

const Logo = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: var(--primary-color);
`;

const Nav = styled.nav`
  display: flex;
  gap: 20px;
`;

const NavLink = styled(Link)`
  text-decoration: none;
  color: var(--text-color);
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 4px;
  transition: background-color 0.3s;

  &:hover {
    background-color: rgba(74, 144, 226, 0.1);
  }
`;

function Header() {
  return (
    <HeaderContainer>
      <Logo>TempMail</Logo>
      <Nav>
        <NavLink to="/">Generate Email</NavLink>
        <NavLink to="/inbox">Inbox</NavLink>
      </Nav>
    </HeaderContainer>
  );
}

export default Header; 