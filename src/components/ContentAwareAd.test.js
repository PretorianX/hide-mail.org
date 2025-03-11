import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import ContentAwareAd from './ContentAwareAd';

// Mock the AdContainer component
jest.mock('./AdContainer', () => {
  return function MockAdContainer({ contentAvailable, ...props }) {
    return contentAvailable ? (
      <div data-testid="ad-container" {...props}>
        Mock Ad Container
      </div>
    ) : null;
  };
});

describe('ContentAwareAd', () => {
  beforeEach(() => {
    // Create a div with content for testing
    const contentDiv = document.createElement('div');
    contentDiv.id = 'content-test';
    document.body.appendChild(contentDiv);
  });

  afterEach(() => {
    // Clean up
    const contentDiv = document.getElementById('content-test');
    if (contentDiv) {
      document.body.removeChild(contentDiv);
    }
  });

  it('should not render ad when content is insufficient', () => {
    const contentDiv = document.getElementById('content-test');
    contentDiv.textContent = 'Short content';

    render(
      <ContentAwareAd
        slot="1234567890"
        contentSelector="#content-test"
        minContentLength={500}
      />
    );

    expect(screen.queryByTestId('ad-container')).not.toBeInTheDocument();
  });

  it('should render ad when content is sufficient', () => {
    // Create content that exceeds the minimum length
    const contentDiv = document.getElementById('content-test');
    contentDiv.textContent = 'a'.repeat(600);

    render(
      <ContentAwareAd
        slot="1234567890"
        contentSelector="#content-test"
        minContentLength={500}
      />
    );

    expect(screen.getByTestId('ad-container')).toBeInTheDocument();
  });

  it('should update when content changes', async () => {
    const contentDiv = document.getElementById('content-test');
    contentDiv.textContent = 'Short content';

    render(
      <ContentAwareAd
        slot="1234567890"
        contentSelector="#content-test"
        minContentLength={500}
      />
    );

    // Initially, the ad should not be shown
    expect(screen.queryByTestId('ad-container')).not.toBeInTheDocument();

    // Update the content to be sufficient
    act(() => {
      contentDiv.textContent = 'a'.repeat(600);
      
      // Manually trigger the MutationObserver callback
      // Get all MutationObservers
      const observers = contentDiv._observers || [];
      if (observers.length > 0) {
        // Simulate a mutation record
        const mockMutationRecord = [{
          type: 'characterData',
          target: contentDiv
        }];
        
        // Call the callback for each observer
        observers.forEach(observer => {
          if (observer.callback) {
            observer.callback(mockMutationRecord, observer);
          }
        });
      }
    });

    // Now wait for the ad to be shown
    await waitFor(() => {
      expect(screen.getByTestId('ad-container')).toBeInTheDocument();
    });
  });
}); 