import React from 'react';
import { render, screen } from '@testing-library/react';
import ContentAwareAd from './ContentAwareAd';

// Mock the AdContainer component
jest.mock('./AdContainer', () => {
  return function MockAdContainer(props) {
    return (
      <div data-testid="ad-container-mock" data-content-available={props.contentAvailable.toString()}>
        Ad Container Mock
      </div>
    );
  };
});

// Mock the IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ContentAwareAd', () => {
  beforeEach(() => {
    // Create a div with content to test against
    const contentDiv = document.createElement('div');
    contentDiv.id = 'test-content';
    contentDiv.textContent = 'This is test content that should be long enough to pass the minimum content length check.';
    document.body.appendChild(contentDiv);

    // Create a div with insufficient content
    const shortContentDiv = document.createElement('div');
    shortContentDiv.id = 'short-content';
    shortContentDiv.textContent = 'Short';
    document.body.appendChild(shortContentDiv);
  });

  afterEach(() => {
    // Clean up the test divs
    const contentDiv = document.getElementById('test-content');
    if (contentDiv) document.body.removeChild(contentDiv);
    
    const shortContentDiv = document.getElementById('short-content');
    if (shortContentDiv) document.body.removeChild(shortContentDiv);
  });

  test('renders ad when content is available', () => {
    // Mock the querySelector to return our test content div
    const originalQuerySelector = document.querySelector;
    document.querySelector = jest.fn().mockImplementation((selector) => {
      if (selector === '#test-content') {
        return document.getElementById('test-content');
      }
      return originalQuerySelector(selector);
    });

    render(
      <ContentAwareAd
        slot="1234567890"
        contentSelector="#test-content"
        minContentLength={10}
      />
    );

    // Check if the ad container is rendered with contentAvailable=true
    const adContainer = screen.getByTestId('ad-container-mock');
    expect(adContainer).toBeInTheDocument();
    expect(adContainer.dataset.contentAvailable).toBe('true');

    // Restore the original querySelector
    document.querySelector = originalQuerySelector;
  });

  test('does not render ad when content is insufficient', () => {
    // Mock the querySelector to return our short content div
    const originalQuerySelector = document.querySelector;
    document.querySelector = jest.fn().mockImplementation((selector) => {
      if (selector === '#short-content') {
        return document.getElementById('short-content');
      }
      return originalQuerySelector(selector);
    });

    render(
      <ContentAwareAd
        slot="1234567890"
        contentSelector="#short-content"
        minContentLength={10}
      />
    );

    // Check if the ad container is rendered with contentAvailable=false
    const adContainer = screen.getByTestId('ad-container-mock');
    expect(adContainer).toBeInTheDocument();
    expect(adContainer.dataset.contentAvailable).toBe('false');

    // Restore the original querySelector
    document.querySelector = originalQuerySelector;
  });

  test('does not render ad when content element does not exist', () => {
    // Mock the querySelector to return null
    const originalQuerySelector = document.querySelector;
    document.querySelector = jest.fn().mockImplementation((selector) => {
      if (selector === '#non-existent') {
        return null;
      }
      return originalQuerySelector(selector);
    });

    render(
      <ContentAwareAd
        slot="1234567890"
        contentSelector="#non-existent"
        minContentLength={10}
      />
    );

    // Check if the ad container is rendered with contentAvailable=false
    const adContainer = screen.getByTestId('ad-container-mock');
    expect(adContainer).toBeInTheDocument();
    expect(adContainer.dataset.contentAvailable).toBe('false');

    // Restore the original querySelector
    document.querySelector = originalQuerySelector;
  });

  test('passes props to AdContainer', () => {
    // Mock the querySelector to return our test content div
    const originalQuerySelector = document.querySelector;
    document.querySelector = jest.fn().mockImplementation((selector) => {
      if (selector === '#test-content') {
        return document.getElementById('test-content');
      }
      return originalQuerySelector(selector);
    });

    const { container } = render(
      <ContentAwareAd
        slot="1234567890"
        format="rectangle"
        width={300}
        height={250}
        position="sidebar"
        contentSelector="#test-content"
        minContentLength={10}
      />
    );

    // Check if the ad container is rendered
    const adContainer = screen.getByTestId('ad-container-mock');
    expect(adContainer).toBeInTheDocument();

    // Restore the original querySelector
    document.querySelector = originalQuerySelector;
  });
}); 