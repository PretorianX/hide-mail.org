import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageList from './MessageList';

// Mock the EmailModal component
jest.mock('./EmailModal', () => {
  return function MockEmailModal({ message, isOpen, onClose }) {
    return isOpen ? (
      <div data-testid="email-modal">
        <div>Modal Content for: {message?.subject}</div>
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null;
  };
});

describe('MessageList', () => {
  const mockMessages = [
    {
      id: 'msg1',
      from: 'sender1@example.com',
      subject: 'Test Subject 1',
      preview: 'This is a test preview 1',
      date: '2023-01-01T12:00:00Z'
    },
    {
      id: 'msg2',
      from: 'sender2@example.com',
      subject: 'Test Subject 2',
      preview: 'This is a test preview 2',
      date: '2023-01-02T12:00:00Z'
    }
  ];

  test('renders empty inbox message when no messages', () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByText('Your inbox is empty')).toBeInTheDocument();
    expect(screen.getByText('Emails sent to your temporary address will appear here')).toBeInTheDocument();
  });

  test('renders list of messages when messages are provided', () => {
    render(<MessageList messages={mockMessages} />);
    expect(screen.getByText('Inbox (2)')).toBeInTheDocument();
    expect(screen.getByText('Test Subject 1')).toBeInTheDocument();
    expect(screen.getByText('Test Subject 2')).toBeInTheDocument();
    expect(screen.getByText('sender1@example.com')).toBeInTheDocument();
    expect(screen.getByText('sender2@example.com')).toBeInTheDocument();
  });

  test('calls onSelectMessage when a message is clicked', () => {
    const onSelectMessageMock = jest.fn();
    render(<MessageList messages={mockMessages} onSelectMessage={onSelectMessageMock} />);
    
    // Click the first message
    fireEvent.click(screen.getByText('Test Subject 1'));
    expect(onSelectMessageMock).toHaveBeenCalledWith('msg1');
  });

  test('applies selected class to the selected message', () => {
    render(<MessageList messages={mockMessages} selectedMessageId="msg1" />);
    
    // Get all message items
    const messageItems = document.querySelectorAll('.message-item');
    
    // Check that the first message has the selected class
    expect(messageItems[0]).toHaveClass('selected');
    
    // Check that the second message does not have the selected class
    expect(messageItems[1]).not.toHaveClass('selected');
  });

  test('opens modal when a message is clicked', () => {
    render(<MessageList messages={mockMessages} />);
    
    // Modal should not be visible initially
    expect(screen.queryByTestId('email-modal')).not.toBeInTheDocument();
    
    // Click the first message
    fireEvent.click(screen.getByText('Test Subject 1'));
    
    // Modal should now be visible
    expect(screen.getByTestId('email-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Content for: Test Subject 1')).toBeInTheDocument();
  });

  test('closes modal when close button is clicked', () => {
    render(<MessageList messages={mockMessages} />);
    
    // Click the first message to open the modal
    fireEvent.click(screen.getByText('Test Subject 1'));
    
    // Modal should be visible
    expect(screen.getByTestId('email-modal')).toBeInTheDocument();
    
    // Click the close button
    fireEvent.click(screen.getByText('Close Modal'));
    
    // Modal should no longer be visible
    expect(screen.queryByTestId('email-modal')).not.toBeInTheDocument();
  });
}); 