import React from 'react';
import EmailService from '../services/EmailService';
import { formatBytes } from '../utils/formatBytes';
import './AttachmentList.css';

/**
 * Files attached to a message, each one a direct download.
 *
 * Inline parts are the images the message body already references, so they are left out of
 * the file list the way a mail client would.
 *
 * @param {Object} props - Component props
 * @param {Array} props.attachments - Attachment metadata from the API
 * @param {string} props.mailbox - Temporary mailbox that received the message
 * @param {string} props.messageId - Message the attachments belong to
 * @returns {React.ReactElement|null} - Rendered list, or null when there is nothing to offer
 */
const AttachmentList = ({ attachments, mailbox, messageId }) => {
  const files = (attachments || []).filter((attachment) => !attachment.inline);

  if (!mailbox || files.length === 0) {
    return null;
  }

  return (
    <div className="attachment-panel" data-testid="attachment-list">
      <h3 className="attachment-panel-title">Attachments ({files.length})</h3>
      <ul className="attachment-panel-items">
        {files.map((attachment) => (
          <li key={attachment.index} className="attachment-panel-item">
            <span className="attachment-panel-icon" aria-hidden="true">📎</span>
            <span className="attachment-panel-name" title={attachment.filename}>
              {attachment.filename}
            </span>
            <span className="attachment-panel-size">{formatBytes(attachment.size)}</span>
            <a
              className="attachment-panel-download"
              data-testid={`attachment-download-${attachment.index}`}
              href={EmailService.attachmentUrl(mailbox, messageId, attachment.index)}
              download={attachment.filename}
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AttachmentList;
