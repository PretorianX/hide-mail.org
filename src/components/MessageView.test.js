import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageView from './MessageView.js';

describe('MessageView Component', () => {
  const mockMessage = {
    id: '123',
    from: 'test@example.com',
    subject: 'Test Subject',
    date: new Date().toISOString(),
    html: '<div>Test HTML content with <img src="test.jpg" alt="test"> image</div>',
    text: 'Test text content',
    preview: 'Test preview'
  };

  const mockOnDelete = jest.fn();
  const mockOnBack = jest.fn();

  test('renders message details correctly', () => {
    render(
      <MessageView 
        message={mockMessage} 
        onDelete={mockOnDelete} 
        onBack={mockOnBack} 
      />
    );
    
    expect(screen.getByText('Test Subject')).toBeInTheDocument();
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
  });

  test('blocks images by default and allows showing them', () => {
    render(
      <MessageView 
        message={mockMessage} 
        onDelete={mockOnDelete} 
        onBack={mockOnBack} 
      />
    );
    
    expect(screen.getByText('Images have been blocked for your security.')).toBeInTheDocument();
    expect(screen.getByText('Show Images')).toBeInTheDocument();
    
    // Check that image is replaced with placeholder
    expect(screen.getByText('🖼️ Image (blocked)')).toBeInTheDocument();
    
    // Click show images button
    fireEvent.click(screen.getByText('Show Images'));
    
    // Image blocker notice should still be there but image should now be rendered
    expect(screen.queryByText('🖼️ Image (blocked)')).not.toBeInTheDocument();
  });

  test('handles back button click', () => {
    render(
      <MessageView 
        message={mockMessage} 
        onDelete={mockOnDelete} 
        onBack={mockOnBack} 
      />
    );
    
    fireEvent.click(screen.getByText('← Back'));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  test('handles delete button click', () => {
    render(
      <MessageView 
        message={mockMessage} 
        onDelete={mockOnDelete} 
        onBack={mockOnBack} 
      />
    );
    
    fireEvent.click(screen.getByText('Delete'));
    expect(mockOnDelete).toHaveBeenCalledWith('123');
  });
}); 