import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import EmailModal from './EmailModal';
import EmailService from '../services/EmailService';

// Mock the EmailService
jest.mock('../services/EmailService', () => ({
  getMessageDetails: jest.fn(),
  attachmentUrl: jest.fn()
}));

jest.mock('../services/ReplyService', () => ({
  getStatus: jest.fn(),
  listReplies: jest.fn(),
  sendReply: jest.fn()
}));

const ReplyService = require('../services/ReplyService');

describe('EmailModal', () => {
  const mockMessage = {
    id: 'test-id-123',
    subject: 'Test Subject',
    from: 'sender@example.com',
    date: new Date().toISOString(),
    html: '<p>Test HTML content</p>',
    text: 'Test text content'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Create React App resets mock implementations between tests.
    EmailService.attachmentUrl.mockImplementation(
      (mailbox, messageId, index) => `/api/emails/${mailbox}/${messageId}/attachments/${index}`
    );
    ReplyService.getStatus.mockResolvedValue({
      active: true,
      smtpConfigured: true,
      canReply: true,
      limit: 1,
      used: 0,
      remaining: 1,
      proReplyLimit: 50,
      maxBodyChars: 5000
    });
    ReplyService.listReplies.mockResolvedValue([]);
  });

  test('renders the modal when isOpen is true', () => {
    render(<EmailModal message={mockMessage} isOpen={true} onClose={() => {}} />);
    
    expect(screen.getByText('Test Subject')).toBeInTheDocument();
    expect(screen.getByText(/From: sender@example.com/)).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    render(<EmailModal message={mockMessage} isOpen={false} onClose={() => {}} />);
    
    expect(screen.queryByText('Test Subject')).not.toBeInTheDocument();
  });

  test('calls onClose when clicking the overlay', () => {
    const onCloseMock = jest.fn();
    render(<EmailModal message={mockMessage} isOpen={true} onClose={onCloseMock} />);
    
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when clicking the close button', () => {
    const onCloseMock = jest.fn();
    render(<EmailModal message={mockMessage} isOpen={true} onClose={onCloseMock} />);
    
    fireEvent.click(screen.getByText('×'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  test('displays email content directly from the message object', () => {
    render(<EmailModal message={mockMessage} isOpen={true} onClose={() => {}} />);
    
    // The SafeEmailViewer should receive the HTML and text content directly from the message
    expect(EmailService.getMessageDetails).not.toHaveBeenCalled();
  });

  test('handles empty email content correctly', () => {
    const emptyContentMessage = {
      ...mockMessage,
      html: '',
      text: ''
    };
    
    render(<EmailModal message={emptyContentMessage} isOpen={true} onClose={() => {}} />);
    
    // Wait for the "No content available" message to appear
    expect(screen.getByText('No content available for this email.')).toBeInTheDocument();
  });

  test('handles message with only text content', () => {
    const textOnlyMessage = {
      ...mockMessage,
      html: '',
      text: 'Text only content'
    };
    
    render(<EmailModal message={textOnlyMessage} isOpen={true} onClose={() => {}} />);
    
    // The text content should be displayed
    expect(screen.getByText('Text only content')).toBeInTheDocument();
  });

  test('handles message with only HTML content', () => {
    const htmlOnlyMessage = {
      ...mockMessage,
      html: '<p>HTML only content</p>',
      text: ''
    };
    
    render(<EmailModal message={htmlOnlyMessage} isOpen={true} onClose={() => {}} />);
    
    // The HTML content will be rendered in an iframe, so we can't easily check its content
    // But we can verify that the SafeEmailViewer is rendered
    expect(screen.queryByText('No content available for this email.')).not.toBeInTheDocument();
  });

  describe('attachments', () => {
    const messageWithInvoice = {
      ...mockMessage,
      attachments: [
        {
          index: 0,
          filename: 'invoice.pdf',
          contentType: 'application/pdf',
          size: 20480,
          inline: false
        }
      ]
    };

    test('offers the attachment as a download', () => {
      render(
        <EmailModal
          message={messageWithInvoice}
          isOpen={true}
          onClose={() => {}}
          tempMailbox="shopper@hide-mail.org"
        />
      );

      const link = screen.getByTestId('attachment-download-0');
      expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
      expect(link).toHaveAttribute(
        'href',
        '/api/emails/shopper@hide-mail.org/test-id-123/attachments/0'
      );
    });

    test('shows no attachment panel for a message without files', () => {
      render(
        <EmailModal
          message={mockMessage}
          isOpen={true}
          onClose={() => {}}
          tempMailbox="shopper@hide-mail.org"
        />
      );

      expect(screen.queryByText(/^Attachments/)).not.toBeInTheDocument();
    });
  });

  describe('replying', () => {
    test('offers a reply to the sender when the mailbox is known', async () => {
      render(
        <EmailModal
          message={mockMessage}
          isOpen={true}
          onClose={() => {}}
          tempMailbox="shopper@hide-mail.org"
        />
      );

      expect(await screen.findByTestId('reply-open'))
        .toHaveTextContent('Reply to sender@example.com');
    });

    test('offers no reply box before an address has been generated', () => {
      render(<EmailModal message={mockMessage} isOpen={true} onClose={() => {}} />);

      expect(screen.queryByTestId('reply-composer')).not.toBeInTheDocument();
      expect(ReplyService.getStatus).not.toHaveBeenCalled();
    });
  });
}); 