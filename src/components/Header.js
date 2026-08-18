import React from 'react';
import { Link } from 'react-router';
import styled from 'styled-components';
import ThemeToggle from './ThemeToggle';
import NavProCta from './NavProCta';
import { useLicense } from '../context/LicenseContext';

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
  position: relative;
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
  color: white;
  text-decoration: none;
  padding: 5px 10px;
  border-radius: 4px;
  transition: background-color 0.3s;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
  
  /* Fix for dark mode - ensure proper contrast without changing font weight */
  [data-theme='dark'] & {
    color: var(--duck-white);
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
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
        
        <Logo to="/">
          <h1>Hide Mail</h1>
          <span>Your friendly temporary email service</span>
        </Logo>
        
        <NavContainer>
          <Nav>
            <NavLink to="/">Home</NavLink>
            <NavLink to="/blog">Blog</NavLink>
            <NavLink to="/about-us">About</NavLink>
            <NavLink to="/contact-us">Contact</NavLink>
            <NavProCta isPro={isPro} daysLeft={daysLeft} />
          </Nav>
        </NavContainer>
      </HeaderContent>
    </HeaderContainer>
  );
};

export default Header; 