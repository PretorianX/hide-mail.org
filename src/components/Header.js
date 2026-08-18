import React from 'react';
import { Link } from 'react-router';
import styled from 'styled-components';
import ThemeToggle from './ThemeToggle';
import NavProCta from './NavProCta';
import { useLicense } from '../context/LicenseContext';
import { HEADER_INK, HEADER_INK_STRONG, HEADER_HOVER_WASH } from '../styles/headerInk';

const HeaderContainer = styled.header`
  background-color: var(--duck-orange);
  padding: 20px 0;
  margin-bottom: 30px;
  text-align: center;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  color: ${HEADER_INK};
`;

const HeaderContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  position: relative;
`;

const Logo = styled(Link)`
  text-decoration: none;
  color: ${HEADER_INK};
  display: block;
  text-align: center;

  &:focus-visible {
    outline: 3px solid ${HEADER_INK_STRONG};
    outline-offset: 2px;
  }

  h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
    color: ${HEADER_INK};
  }
  
  span {
    font-size: 16px;
    color: ${HEADER_INK};
    display: block;
    margin-top: 5px;
  }
`;

const NavContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 15px;
`;

const Nav = styled.nav`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;

  @media (max-width: 768px) {
    gap: 10px;
  }
`;

const ThemeToggleContainer = styled.div`
  position: absolute;
  right: 20px;
  top: 20px;
`;

const NavLink = styled(Link)`
  color: ${HEADER_INK};
  text-decoration: none;
  padding: 5px 10px;
  border-radius: 4px;
  transition: background-color 0.3s, color 0.3s;

  &:hover,
  &:active {
    background-color: ${HEADER_HOVER_WASH};
    color: ${HEADER_INK_STRONG};
  }

  &:focus-visible {
    outline: 3px solid ${HEADER_INK_STRONG};
    outline-offset: 2px;
  }
`;

const Header = () => {
  const { isPro, license } = useLicense();
  const daysLeft = license?.remainingDays
    ?? (license?.expiresAt
      ? Math.max(0, Math.ceil((license.expiresAt - Date.now()) / 86400000))
      : null);

  return (
    <HeaderContainer className="app-header">
      <HeaderContent>
        <ThemeToggleContainer>
          <ThemeToggle />
        </ThemeToggleContainer>
        
        <Logo to="/" className="app-header-logo">
          <h1>Hide Mail</h1>
          <span className="app-header-tagline">Your friendly temporary email service</span>
        </Logo>
        
        <NavContainer>
          <Nav>
            <NavLink className="nav-link" to="/">Home</NavLink>
            <NavLink className="nav-link" to="/blog">Blog</NavLink>
            <NavLink className="nav-link" to="/about-us">About</NavLink>
            <NavLink className="nav-link" to="/contact-us">Contact</NavLink>
            <NavProCta isPro={isPro} daysLeft={daysLeft} />
          </Nav>
        </NavContainer>
      </HeaderContent>
    </HeaderContainer>
  );
};

export default Header; 