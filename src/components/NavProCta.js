import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router';
import styled, { css } from 'styled-components';

/*
 * The header bar is painted with --duck-orange in both themes, so this CTA is deliberately
 * theme-independent: a white fill with dark-amber ink reads at 8.56:1 on either bar, while
 * the plain white nav links only reach 2.28:1. The 2px border is what carries the button's
 * boundary contrast (3.75:1 light / 4.18:1 dark) since a bare white fill sits at 2.05:1.
 */
const INK = '#7a3b00';
const INK_FOCUS = '#5c2d00';
const FILL = '#ffffff';

const pillBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: 999px;
  background: ${FILL};
  color: ${INK};
  text-decoration: none;
  line-height: 1.2;
  white-space: nowrap;

  &:focus-visible {
    outline: 3px solid ${INK_FOCUS};
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    width: 100%;
    margin-left: 0;
  }
`;

const ProUpgrade = styled(Link)`
  ${pillBase}
  margin-left: 8px;
  padding: 8px 20px;
  border: 2px solid ${INK};
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
  transition: background-color 0.2s ease, color 0.2s ease;

  &:hover {
    background: ${INK};
    color: ${FILL};
  }
`;

const ProMember = styled(Link)`
  ${pillBase}
  margin-left: 8px;
  padding: 6px 16px;
  border: 2px solid ${INK};
  font-size: 14px;
  font-weight: 700;
`;

const NavProCta = ({ isPro, daysLeft }) => {
  if (!isPro) {
    return (
      <ProUpgrade className="nav-pro-cta" to="/pro">
        Go Pro
      </ProUpgrade>
    );
  }

  return (
    <ProMember className="nav-pro-cta nav-pro-cta--member" to="/pro">
      Pro
      {typeof daysLeft === 'number' && (
        <span data-testid="header-pro-days">&nbsp;· {daysLeft} days left</span>
      )}
    </ProMember>
  );
};

NavProCta.propTypes = {
  isPro: PropTypes.bool.isRequired,
  daysLeft: PropTypes.number,
};

export default NavProCta;
