import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPolicy from './PrivacyPolicy';

describe('PrivacyPolicy Component', () => {
  test('renders privacy policy page with correct title', () => {
    render(<PrivacyPolicy />);
    const titleElement = screen.getByText(/Privacy Policy/i);
    expect(titleElement).toBeInTheDocument();
  });

  test('renders all required sections', () => {
    render(<PrivacyPolicy />);
    
    // Check for important sections
    expect(screen.getByText(/Information We Collect/i)).toBeInTheDocument();
    expect(screen.getByText(/How We Use Your Information/i)).toBeInTheDocument();
    expect(screen.getByText(/Cookies and Similar Technologies/i)).toBeInTheDocument();
    expect(screen.getByText(/Advertising/i)).toBeInTheDocument();
    expect(screen.getByText(/Data Retention/i)).toBeInTheDocument();
    expect(screen.getByText(/Security/i)).toBeInTheDocument();
    expect(screen.getByText(/Children's Privacy/i)).toBeInTheDocument();
    expect(screen.getByText(/Changes to This Privacy Policy/i)).toBeInTheDocument();
    expect(screen.getByText(/Contact Us/i)).toBeInTheDocument();
    expect(screen.getByText(/Data Sharing with mail-duck.com Services/i)).toBeInTheDocument();
  });

  test('renders contact email information', () => {
    render(<PrivacyPolicy />);
    const emailText = screen.getByText(/privacy@mail-duck.com/i);
    expect(emailText).toBeInTheDocument();
  });
  
  test('mentions mail-duck.com as parent service', () => {
    render(<PrivacyPolicy />);
    expect(screen.getByText(/a service provided by mail-duck.com/i)).toBeInTheDocument();
    expect(screen.getByText(/mail-duck.com/i).closest('a')).toHaveAttribute('href', 'https://mail-duck.com');
  });
}); 