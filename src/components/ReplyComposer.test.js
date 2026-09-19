import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReplyComposer from './ReplyComposer';

jest.mock('../services/ReplyService', () => ({
  getStatus: jest.fn(),
  listReplies: jest.fn(),
  sendReply: jest.fn(),
}));

const ReplyService = require('../services/ReplyService');

const MAILBOX = 'shopper@hide-mail.org';

const message = {
  id: 'msg-1',
  from: '"Ada Support" <ada@shop.test>',
  subject: 'Your order #4417',
};

const freeStatus = {
  active: true,
  smtpConfigured: true,
  canReply: true,
  planType: 'free',
  limit: 1,
  used: 0,
  remaining: 1,
  proReplyLimit: 50,
  maxBodyChars: 5000,
};

// Create React App resets mock implementations between tests, so stubs are installed here.
beforeEach(() => {
  ReplyService.getStatus.mockResolvedValue(freeStatus);
  ReplyService.listReplies.mockResolvedValue([]);
  ReplyService.sendReply.mockResolvedValue({ to: 'ada@shop.test', remaining: 0 });
});

const renderComposer = async (props = {}) => {
  render(<ReplyComposer mailbox={MAILBOX} message={message} {...props} />);
  await screen.findByTestId('reply-composer');
};

describe('ReplyComposer', () => {
  it('offers to reply to whoever sent the message', async () => {
    await renderComposer();

    expect(screen.getByTestId('reply-open')).toHaveTextContent('Reply to ada@shop.test');
  });

  it('shows how much of the allowance is left', async () => {
    await renderComposer();

    expect(screen.getByTestId('reply-quota')).toHaveTextContent('1 of 1 left on this address');
  });

  it('renders nothing until the allowance is known', () => {
    ReplyService.getStatus.mockReturnValue(new Promise(() => {}));

    const { container } = render(<ReplyComposer mailbox={MAILBOX} message={message} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('asks for nothing when there is no mailbox to reply from', () => {
    const { container } = render(<ReplyComposer message={message} />);

    expect(container).toBeEmptyDOMElement();
    expect(ReplyService.getStatus).not.toHaveBeenCalled();
  });

  it('sends the typed text for the message being read', async () => {
    const user = userEvent.setup();
    await renderComposer();

    await user.click(screen.getByTestId('reply-open'));
    await user.type(screen.getByTestId('reply-body'), 'Yes, that address is correct.');
    await user.click(screen.getByTestId('reply-send'));

    await waitFor(() => expect(ReplyService.sendReply).toHaveBeenCalledWith(
      MAILBOX,
      'msg-1',
      'Yes, that address is correct.'
    ));
  });

  it('will not send an empty reply', async () => {
    const user = userEvent.setup();
    await renderComposer();

    await user.click(screen.getByTestId('reply-open'));

    expect(screen.getByTestId('reply-send')).toBeDisabled();
  });

  it('counts characters against the cap the server enforces', async () => {
    const user = userEvent.setup();
    await renderComposer();

    await user.click(screen.getByTestId('reply-open'));
    await user.type(screen.getByTestId('reply-body'), 'Hello');

    expect(screen.getByTestId('reply-count')).toHaveTextContent('5 / 5000');
  });

  it('lists a reply that was already sent', async () => {
    ReplyService.listReplies.mockResolvedValue([
      {
        to: 'ada@shop.test',
        subject: 'Re: Your order #4417',
        body: 'Confirmed.',
        sentAt: '2026-09-19T09:00:00.000Z',
      },
    ]);
    await renderComposer();

    expect(screen.getByTestId('reply-sent-list')).toHaveTextContent('Confirmed.');
    expect(screen.getByTestId('reply-sent-list')).toHaveTextContent('ada@shop.test');
  });

  it('names Pro when a free address has spent its allowance', async () => {
    ReplyService.getStatus.mockResolvedValue({ ...freeStatus, remaining: 0, canReply: false });
    await renderComposer();

    const note = screen.getByTestId('reply-limit-note');
    expect(note).toHaveTextContent('used all 1 of its replies');
    expect(note).toHaveTextContent('50 replies per address');
    expect(screen.getByRole('link', { name: 'See Hide Mail Pro' })).toHaveAttribute('href', '/pro');
    expect(screen.queryByTestId('reply-open')).not.toBeInTheDocument();
  });

  it('switches to the Pro note when the send is refused for quota', async () => {
    const user = userEvent.setup();
    ReplyService.sendReply.mockRejectedValue(
      Object.assign(new Error('all used'), { code: 'REPLY_LIMIT_REACHED' })
    );
    await renderComposer();

    await user.click(screen.getByTestId('reply-open'));
    await user.type(screen.getByTestId('reply-body'), 'Hello');
    await user.click(screen.getByTestId('reply-send'));

    expect(await screen.findByTestId('reply-limit-note')).toBeInTheDocument();
  });

  it('shows the reason when a send fails for any other cause', async () => {
    const user = userEvent.setup();
    ReplyService.sendReply.mockRejectedValue(
      Object.assign(new Error('The recipient rejected your reply.'), {
        code: 'RECIPIENT_REJECTED',
      })
    );
    await renderComposer();

    await user.click(screen.getByTestId('reply-open'));
    await user.type(screen.getByTestId('reply-body'), 'Hello');
    await user.click(screen.getByTestId('reply-send'));

    expect(await screen.findByTestId('reply-error'))
      .toHaveTextContent('The recipient rejected your reply.');
  });

  it('says so instead of offering a box when outbound mail is unavailable', async () => {
    ReplyService.getStatus.mockResolvedValue({
      ...freeStatus,
      smtpConfigured: false,
      canReply: false,
    });
    await renderComposer();

    expect(screen.getByText('Replying is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByTestId('reply-open')).not.toBeInTheDocument();
  });

  it('says so when the address has expired', async () => {
    ReplyService.getStatus.mockResolvedValue({
      active: false,
      smtpConfigured: true,
      canReply: false,
      maxBodyChars: 5000,
    });
    await renderComposer();

    expect(screen.getByText('This address has expired, so it can no longer reply.'))
      .toBeInTheDocument();
  });
});
