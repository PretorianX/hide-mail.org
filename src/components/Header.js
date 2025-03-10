import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

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
  
  h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
    color: white;
  }
  
  span {
    font-size: 16px;
    color: white;
    display: block;
    margin-top: 5px;
  }
`;

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
  border-radius: 4px;
  transition: background-color 0.3s;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
`;

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

const Header = () => {
  return (
    <HeaderContainer className="app-header">
      <HeaderContent>
        <Logo to="/">
          <h1>Hide Mail</h1>
          <span>Your friendly temporary email service</span>
        </Logo>
        
        <Nav>
          <NavLink to="/">Home</NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/contact">Contact</NavLink>
        </Nav>
      </HeaderContent>
    </HeaderContainer>
  );
};

export default Header; 