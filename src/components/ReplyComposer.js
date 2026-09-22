import React, { useCallback, useEffect, useState } from 'react';
import ReplyService from '../services/ReplyService';
import { addressOf } from '../utils/mailAddress';
import './ReplyComposer.css';

/**
 * Reply to a message from the temporary address that received it.
 *
 * The recipient is shown, never edited: the backend addresses the reply from the stored
 * message, so this box can only answer whoever wrote in.
 *
 * @param {Object} props - Component props
 * @param {string} props.mailbox - Temporary address that received the message
 * @param {Object} props.message - The message being answered
 */
const ReplyComposer = ({ mailbox, message }) => {
  const [status, setStatus] = useState(null);
  const [sent, setSent] = useState([]);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);

  const messageId = message?.id;

  const load = useCallback(async () => {
    if (!mailbox || !messageId) {
      return;
    }
    const [replyStatus, replies] = await Promise.all([
      ReplyService.getStatus(mailbox),
      ReplyService.listReplies(mailbox, messageId),
    ]);
    setStatus(replyStatus);
    setSent(replies);
    setLimitReached(replyStatus.active && replyStatus.smtpConfigured && !replyStatus.canReply);
  }, [mailbox, messageId]);

  useEffect(() => {
    // Nothing renders until the allowance is known, so a failed lookup simply leaves the
    // panel hidden rather than offering a reply box that cannot send.
    load().catch((err) => console.error('Failed to load reply status:', err));
  }, [load]);

  const handleSend = async (event) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await ReplyService.sendReply(mailbox, messageId, body);
      setBody('');
      setOpen(false);
      await load();
    } catch (err) {
      if (err.code === 'REPLY_LIMIT_REACHED') {
        setLimitReached(true);
        setOpen(false);
      } else {
        setError(err.message);
      }
    } finally {
      setSending(false);
    }
  };

  if (!mailbox || !messageId || !status) {
    return null;
  }

  const recipient = addressOf(message.replyTo || message.from);
  const tooLong = body.length > status.maxBodyChars;

  return (
    <div className="reply-panel" data-testid="reply-composer">
      <div className="reply-panel-header">
        <h3 className="reply-panel-title">Reply</h3>
        {status.active && status.smtpConfigured && !limitReached ? (
          <span className="reply-panel-quota" data-testid="reply-quota">
            {status.remaining} of {status.limit} left on this address
          </span>
        ) : null}
      </div>

      {sent.length > 0 ? (
        <ul className="reply-panel-sent" data-testid="reply-sent-list">
          {sent.map((reply) => (
            <li key={reply.sentAt} className="reply-panel-sent-item">
              <span className="reply-panel-sent-meta">
                You replied to {reply.to} on {new Date(reply.sentAt).toLocaleString()}
              </span>
              <p className="reply-panel-sent-body">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {!status.active ? (
        <p className="reply-panel-note">This address has expired, so it can no longer reply.</p>
      ) : !status.smtpConfigured ? (
        <p className="reply-panel-note">Replying is unavailable right now.</p>
      ) : limitReached ? (
        <p className="reply-panel-note" data-testid="reply-limit-note">
          This address has used all {status.limit} of its replies. Hide Mail Pro raises the
          allowance to {status.proReplyLimit} replies per address.{' '}
          <a className="reply-panel-upgrade" href="/pro">See Hide Mail Pro</a>
        </p>
      ) : open ? (
        <form className="reply-panel-form" onSubmit={handleSend}>
          <p className="reply-panel-to">
            To <strong>{recipient}</strong> from <strong>{mailbox}</strong>
          </p>
          <textarea
            className="reply-panel-input"
            data-testid="reply-body"
            aria-label="Your reply"
            rows={5}
            value={body}
            autoFocus
            onChange={(event) => setBody(event.target.value)}
            placeholder={`Write your reply to ${recipient}`}
          />
          <div className="reply-panel-actions">
            <span className="reply-panel-count" data-testid="reply-count">
              {body.length} / {status.maxBodyChars}
            </span>
            <button
              type="button"
              className="reply-panel-cancel"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="reply-panel-send"
              data-testid="reply-send"
              disabled={sending || !body.trim() || tooLong}
            >
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="reply-panel-open"
          data-testid="reply-open"
          onClick={() => setOpen(true)}
        >
          Reply to {recipient}
        </button>
      )}

      {error ? (
        <p className="reply-panel-error" role="alert" data-testid="reply-error">{error}</p>
      ) : null}
    </div>
  );
};

export default ReplyComposer;
