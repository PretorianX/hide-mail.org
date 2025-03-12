import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageItem from './MessageItem';

// Mock the formatDate function
jest.mock('../utils/dateUtils.js', () => ({
  formatDate: jest.fn(() => '')
}));

describe('MessageItem Component', () => {
  const mockMessage = {
    id: '123',
    from: 'test@example.com',
    subject: 'Test Subject',
    date: new Date().toISOString(),
    preview: 'This is a test preview'
  };

  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders message item with correct content', () => {
    render(<MessageItem message={mockMessage} onClick={mockOnClick} />);
    
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Test Subject')).toBeInTheDocument();
    expect(screen.getByText('This is a test preview')).toBeInTheDocument();
    
    // Check for date element's existence
    const dateElement = screen.getByTestId('message-date');
    expect(dateElement).toBeInTheDocument();
  });

  test('calls onClick when clicked', () => {
    render(<MessageItem message={mockMessage} onClick={mockOnClick} />);
    
    // Use the container element instead of a specific text
    const messageItem = screen.getByText('test@example.com').closest('.message-item');
    fireEvent.click(messageItem);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  test('strips HTML tags from preview text', () => {
    const messageWithHtml = {
      ...mockMessage,
      preview: '<li class="message-item"><div class="message-header"><span>"Namecheap" &lt;hello@namecheap.com&gt;</span><span>11.03.2025, 21:03:51</span></div><div class="message-subject">Our Solopreneur Sale is live!</div><div class="message-preview">Namecheap Discounts</div></li>'
    };
    
    render(<MessageItem message={messageWithHtml} onClick={mockOnClick} />);
    
    // The HTML tags should be stripped, and we should see the text content
    const previewElement = screen.getByTestId('message-preview');
    expect(previewElement).toBeInTheDocument();
    
    // The content should contain the text but not the HTML tags
    expect(previewElement.textContent).toContain('Namecheap');
    expect(previewElement.innerHTML).not.toContain('<li');
    expect(previewElement.innerHTML).not.toContain('<div');
  });

  test('uses text content if preview is not available', () => {
    const messageWithText = {
      ...mockMessage,
      preview: '',
      text: 'This is the text content'
    };
    
    render(<MessageItem message={messageWithText} onClick={mockOnClick} />);
    
    expect(screen.getByText('This is the text content')).toBeInTheDocument();
  });

  test('handles empty preview and text gracefully', () => {
    const emptyMessage = {
      ...mockMessage,
      preview: '',
      text: ''
    };
    
    render(<MessageItem message={emptyMessage} onClick={mockOnClick} />);
    
    // The component should render without errors
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Test Subject')).toBeInTheDocument();
  });
}); 