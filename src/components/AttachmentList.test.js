import React from 'react';
import { render, screen } from '@testing-library/react';
import AttachmentList from './AttachmentList';

jest.mock('../services/EmailService', () => ({
  attachmentUrl: jest.fn(),
}));

const EmailService = require('../services/EmailService');

// Create React App resets mock implementations between tests, so the stub is installed here.
beforeEach(() => {
  EmailService.attachmentUrl.mockImplementation(
    (mailbox, messageId, index) => `/api/emails/${mailbox}/${messageId}/attachments/${index}`
  );
});

const invoice = {
  index: 0,
  filename: 'invoice.pdf',
  contentType: 'application/pdf',
  size: 20480,
  inline: false,
};

describe('AttachmentList', () => {
  it('renders nothing when the message has no attachments', () => {
    const { container } = render(
      <AttachmentList attachments={[]} mailbox="a@hide-mail.org" messageId="msg-1" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when attachments are missing from the message', () => {
    const { container } = render(
      <AttachmentList mailbox="a@hide-mail.org" messageId="msg-1" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the filename and human readable size', () => {
    render(
      <AttachmentList attachments={[invoice]} mailbox="a@hide-mail.org" messageId="msg-1" />
    );

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('20 KB')).toBeInTheDocument();
  });

  it('counts the attachments in the heading', () => {
    render(
      <AttachmentList
        attachments={[invoice, { ...invoice, index: 1, filename: 'terms.txt' }]}
        mailbox="a@hide-mail.org"
        messageId="msg-1"
      />
    );

    expect(screen.getByText('Attachments (2)')).toBeInTheDocument();
  });

  it('links each attachment to its download endpoint and asks the browser to save it', () => {
    render(
      <AttachmentList attachments={[invoice]} mailbox="a@hide-mail.org" messageId="msg-1" />
    );

    const link = screen.getByTestId('attachment-download-0');
    expect(EmailService.attachmentUrl).toHaveBeenCalledWith('a@hide-mail.org', 'msg-1', 0);
    expect(link).toHaveAttribute('href', '/api/emails/a@hide-mail.org/msg-1/attachments/0');
    expect(link).toHaveAttribute('download', 'invoice.pdf');
  });

  it('hides inline parts, which belong to the message body rather than the file list', () => {
    render(
      <AttachmentList
        attachments={[{ ...invoice, index: 0, filename: 'logo.png', inline: true }, { ...invoice, index: 1 }]}
        mailbox="a@hide-mail.org"
        messageId="msg-1"
      />
    );

    expect(screen.queryByText('logo.png')).not.toBeInTheDocument();
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('Attachments (1)')).toBeInTheDocument();
  });

  it('renders nothing when every part is inline', () => {
    const { container } = render(
      <AttachmentList
        attachments={[{ ...invoice, filename: 'logo.png', inline: true }]}
        mailbox="a@hide-mail.org"
        messageId="msg-1"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without a mailbox to download from', () => {
    const { container } = render(<AttachmentList attachments={[invoice]} messageId="msg-1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
