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

  test('sanitizes malicious HTML content (XSS protection)', () => {
    const maliciousMessage = {
      id: '456',
      from: 'attacker@evil.com',
      subject: 'Malicious Email',
      date: new Date().toISOString(),
      html: '<div>Safe content</div><script>alert("xss")</script><div onclick="alert(\'xss\')">Click me</div>',
    };

    const { container } = render(
      <MessageView 
        message={maliciousMessage} 
        onDelete={mockOnDelete} 
        onBack={mockOnBack} 
      />
    );
    
    // Script tags should be removed
    expect(container.querySelector('script')).toBeNull();
    
    // Inline event handlers should be removed
    const htmlContent = container.querySelector('.message-html-content');
    expect(htmlContent.innerHTML).not.toContain('onclick');
    expect(htmlContent.innerHTML).not.toContain('alert');
    
    // Safe content should remain
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  test('sanitizes nested script injection attempts', () => {
    const nestedScriptMessage = {
      id: '789',
      from: 'attacker@evil.com',
      subject: 'Nested Script Attack',
      date: new Date().toISOString(),
      html: '<div>Content</div><scr<script>ipt>alert("xss")</scr</script>ipt>',
    };

    const { container } = render(
      <MessageView 
        message={nestedScriptMessage} 
        onDelete={mockOnDelete} 
        onBack={mockOnBack} 
      />
    );
    
    // No script tags should exist after sanitization
    expect(container.querySelector('script')).toBeNull();
    
    const htmlContent = container.querySelector('.message-html-content');
    // Ensure no actual script tags remain (DOMPurify removes them)
    expect(htmlContent.innerHTML).not.toContain('<script>');
    expect(htmlContent.innerHTML).not.toContain('</script>');
    // The remaining text fragments are safely escaped and not executable
    // "alert" may appear as plain text but is not in an executable context
  });
}); 