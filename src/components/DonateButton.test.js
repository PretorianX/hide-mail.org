import React from 'react';
import { render, screen } from '@testing-library/react';
import DonateButton from './DonateButton';

describe('DonateButton', () => {
  test('renders donate button container', () => {
    render(<DonateButton />);
    
    expect(screen.getByText('Support Hide Mail')).toBeInTheDocument();
  });
  
  test('renders with custom className', () => {
    const { container } = render(<DonateButton className="footer-donate" />);
    
    expect(container.querySelector('.donate-button-container.footer-donate')).toBeInTheDocument();
  });
  
  test('creates unique button id for each instance', () => {
    const { container: container1 } = render(<DonateButton />);
    const { container: container2 } = render(<DonateButton />);
    
    const button1 = container1.querySelector('[id^="donate-button-"]');
    const button2 = container2.querySelector('[id^="donate-button-"]');
    
    expect(button1.id).not.toBe(button2.id);
  });
  
  test('renders donate button element', () => {
    const { container } = render(<DonateButton />);
    
    const donateButton = container.querySelector('.donate-button');
    expect(donateButton).toBeInTheDocument();
    expect(donateButton.id).toMatch(/^donate-button-/);
  });
});

