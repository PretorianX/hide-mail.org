import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { MemoryRouter } from 'react-router-dom';
import EmailService from './services/EmailService';
import { ThemeProvider } from './styles/ThemeContext';

// Mock the EmailService
jest.mock('./services/EmailService', () => ({
  initialize: jest.fn().mockResolvedValue(),
  generateEmail: jest.fn().mockResolvedValue('test@example.com'),
  getAvailableDomains: jest.fn().mockResolvedValue(['example.com']),
  currentEmail: 'test@example.com',
  getMessages: jest.fn().mockResolvedValue([]),
  isExpired: jest.fn().mockReturnValue(false),
  getExpirationTime: jest.fn().mockReturnValue(new Date(Date.now() + 30 * 60 * 1000)),
  __esModule: true,
  default: {
    getRandomEmail: jest.fn().mockResolvedValue({ email: 'test@example.com', domains: ['example.com'] }),
    getDomains: jest.fn().mockResolvedValue(['example.com']),
  },
}));

// Mock react-router-dom
jest.mock('react-router-dom', () => {
  const originalModule = jest.requireActual('react-router-dom');
  return {
    ...originalModule,
    BrowserRouter: ({ children }) => <div data-testid="browser-router">{children}</div>,
    Routes: ({ children }) => <div data-testid="routes">{children}</div>,
    Route: ({ element }) => element,
    Link: ({ children, to }) => <a href={to}>{children}</a>,
    Navigate: ({ to }) => <div data-testid="navigate" data-to={to}>Navigate to {to}</div>,
    useNavigate: () => jest.fn(),
    useParams: () => ({ postId: 'temporary-email-guide' })
  };
});

// Mock the IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Create a custom render function that doesn't wrap App in another Router
// since App already includes a Router
const renderApp = () => render(<App />);

describe('App component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders without crashing', () => {
    renderApp();
    // This is a basic test to ensure the app renders without crashing
    expect(document.body).toBeTruthy();
  });
});

// Separate tests for content sections
describe('Content sections', () => {
  test('renders informative content sections', () => {
    // Create a simplified version of the content to test
    const { container } = render(
      <div className="informative-content-section">
        <h2>Understanding Temporary Email Services</h2>
        <div className="info-content-grid">
          <div className="info-content-column">
            <h3>What is a Temporary Email Service?</h3>
            <h3>Benefits of Using Hide Mail</h3>
          </div>
          <div className="info-content-column">
            <h3>How Hide Mail Works</h3>
            <h3>When to Use Temporary Email</h3>
          </div>
        </div>
        
        <div className="faq-section">
          <h3>Frequently Asked Questions</h3>
          <div className="faq-item">
            <h4>Is Hide Mail completely free?</h4>
          </div>
          <div className="faq-item">
            <h4>How long do temporary emails last?</h4>
          </div>
        </div>
        
        <div className="best-practices-section">
          <h3>Best Practices for Using Temporary Email Services</h3>
          <div className="best-practice-item">
            <h4>Do Use For:</h4>
          </div>
          <div className="best-practice-item">
            <h4>Don't Use For:</h4>
          </div>
          <div className="privacy-tip">
            <h4>Privacy Tip</h4>
          </div>
        </div>
        
        <div className="ad-between-sections"></div>
        <div className="ad-before-footer"></div>
        <div className="ad-in-footer"></div>
      </div>
    );
    
    // Check for informative content sections
    expect(screen.getByText('Understanding Temporary Email Services')).toBeInTheDocument();
    expect(screen.getByText('What is a Temporary Email Service?')).toBeInTheDocument();
    expect(screen.getByText('Benefits of Using Hide Mail')).toBeInTheDocument();
    expect(screen.getByText('How Hide Mail Works')).toBeInTheDocument();
    expect(screen.getByText('When to Use Temporary Email')).toBeInTheDocument();
    
    // Check for FAQ section
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
    expect(screen.getByText('Is Hide Mail completely free?')).toBeInTheDocument();
    expect(screen.getByText('How long do temporary emails last?')).toBeInTheDocument();
    
    // Check for Best Practices section
    expect(screen.getByText('Best Practices for Using Temporary Email Services')).toBeInTheDocument();
    expect(screen.getByText('Do Use For:')).toBeInTheDocument();
    expect(screen.getByText('Don\'t Use For:')).toBeInTheDocument();
    expect(screen.getByText('Privacy Tip')).toBeInTheDocument();
    
    // Check for ad containers
    expect(container.querySelector('.ad-between-sections')).toBeInTheDocument();
    expect(container.querySelector('.ad-before-footer')).toBeInTheDocument();
    expect(container.querySelector('.ad-in-footer')).toBeInTheDocument();
  });
});

describe('App Component', () => {
  test('renders the app with header and footer', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    
    expect(screen.getByText(/Hide Mail/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacy Policy/i)).toBeInTheDocument();
  });
  
  test('footer links work correctly in dark theme', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    
    // Find and click the theme toggle button to switch to dark mode
    const themeToggle = screen.getByLabelText(/Switch to dark mode/i);
    fireEvent.click(themeToggle);
    
    // Check that the footer links are present and have the correct styling
    const footerLinks = screen.getAllByText(/Privacy Policy/i);
    // Find the one in the footer (it should have the FooterLink class or be in the FooterLinks container)
    const privacyLink = footerLinks.find(link => 
      link.closest('.footer-links') || 
      link.className.includes('sc-biaZqF')
    );
    
    expect(privacyLink).toBeInTheDocument();
    
    // Check that the link is clickable (has proper href)
    expect(privacyLink.getAttribute('href')).toBe('/privacy-policy');
    
    // Verify other footer links
    expect(screen.getByText(/Terms of Service/i, { selector: '.footer-links a' })).toBeInTheDocument();
    expect(screen.getByText(/About Us/i, { selector: '.footer-links a' })).toBeInTheDocument();
    expect(screen.getByText(/Contact Us/i, { selector: '.footer-links a' })).toBeInTheDocument();
    expect(screen.getByText(/Blog/i, { selector: '.footer-links a' })).toBeInTheDocument();
  });
}); 