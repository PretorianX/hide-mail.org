import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPolicy from './PrivacyPolicy';

describe('PrivacyPolicy Component', () => {
  test('renders privacy policy page with correct title', () => {
    render(<PrivacyPolicy />);
    const titleElement = screen.getByRole('heading', { name: /Privacy Policy/i, level: 1 });
    expect(titleElement).toBeInTheDocument();
  });

  test('renders all required sections', () => {
    render(<PrivacyPolicy />);
    
    // Check for important sections by finding the section headings
    expect(screen.getByRole('heading', { name: /Information We Collect/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /How We Use Your Information/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Cookies and Similar Technologies/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Advertising/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Data Retention/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Security/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Children's Privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Changes to This Privacy Policy/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Contact Us/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Data Sharing with mail-duck.com Services/i })).toBeInTheDocument();
  });

  test('renders contact email information', () => {
    render(<PrivacyPolicy />);
    const emailText = screen.getByText(/privacy@mail-duck.com/i);
    expect(emailText).toBeInTheDocument();
  });
  
  test('mentions mail-duck.com as parent service', () => {
    render(<PrivacyPolicy />);
    // Find the text that mentions mail-duck.com as a service provider
    expect(screen.getByText(/a service provided by mail-duck.com/i)).toBeInTheDocument();
    
    // Find the link by role and name
    const mailDuckLink = screen.getByRole('link', { name: /mail-duck\.com/i });
    expect(mailDuckLink).toHaveAttribute('href', 'https://mail-duck.com');
  });
}); 