import React from 'react';
import PropTypes from 'prop-types';
import './HomeProBadge.css';

const HomeProBadge = ({ daysLeft }) => (
  <p className="home-pro-active" data-testid="home-pro-active">
    Pro active
    {typeof daysLeft === 'number' ? ` · ${daysLeft} days left` : ''}
    {' — '}
    alias and lifetime apply when you change the address
  </p>
);

HomeProBadge.propTypes = {
  daysLeft: PropTypes.number,
};

export default HomeProBadge;
