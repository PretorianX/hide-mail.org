/**
 * Attachment access for stored messages.
 *
 * Inbound mail is parsed by server.js and each part is kept as base64 inside the message
 * JSON. This module is the only place that turns those parts into something a browser or an
 * API client may hold: it describes them without the payload, decodes one by index, and
 * makes sure a hostile sender cannot pick our filename or content type.
 */

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const DEFAULT_FILENAME = 'attachment';
const MAX_FILENAME_LENGTH = 120;
const MIME_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

// Types a browser would run if it ever ignored the download disposition. They are served as
// opaque bytes so an attachment can never execute against the origin that serves the API.
const ACTIVE_CONTENT_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'text/ecmascript',
]);

const safeFilename = (filename) => {
  const collapsed = String(filename || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]/g, '')
    .replace(/^\.+/, '')
    .trim();

  if (!collapsed) {
    return DEFAULT_FILENAME;
  }

  return collapsed.slice(0, MAX_FILENAME_LENGTH);
};

const safeContentType = (contentType) => {
  const normalised = String(contentType || '').split(';')[0].trim().toLowerCase();

  if (!MIME_TYPE_PATTERN.test(normalised) || ACTIVE_CONTENT_TYPES.has(normalised)) {
    return DEFAULT_CONTENT_TYPE;
  }

  return normalised;
};

const isDownloadable = (attachment) =>
  Boolean(attachment) && attachment.encoding === 'base64' && typeof attachment.content === 'string'
    && attachment.content.length > 0;

const decodedSize = (base64Content) => Buffer.byteLength(base64Content, 'base64');

/**
 * Describe the downloadable parts of a message. The index is the position in the stored
 * attachment array so it stays valid for a download request.
 *
 * @param {Object} message - Stored message
 * @returns {Array<{index: number, filename: string, contentType: string, size: number, inline: boolean}>}
 */
const listAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];

  return attachments.reduce((listed, attachment, index) => {
    if (isDownloadable(attachment)) {
      listed.push({
        index,
        filename: safeFilename(attachment.filename),
        contentType: safeContentType(attachment.contentType),
        size: decodedSize(attachment.content),
        inline: Boolean(attachment.cid),
      });
    }
    return listed;
  }, []);
};

/**
 * Decode one attachment for delivery.
 *
 * @param {Object} message - Stored message
 * @param {string|number} index - Position in the stored attachment array
 * @returns {{filename: string, contentType: string, content: Buffer}|null}
 */
const resolveAttachment = (message, index) => {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const position = Number(index);

  if (!Number.isInteger(position) || position < 0 || position >= attachments.length) {
    return null;
  }

  const attachment = attachments[position];
  if (!isDownloadable(attachment)) {
    return null;
  }

  return {
    filename: safeFilename(attachment.filename),
    contentType: safeContentType(attachment.contentType),
    content: Buffer.from(attachment.content, 'base64'),
  };
};

/**
 * Build a Content-Disposition header that always saves the file, naming it twice so clients
 * that do not read RFC 5987 still get a usable ASCII name.
 *
 * @param {string} filename - Already sanitized filename
 * @returns {string}
 */
const contentDispositionHeader = (filename) => {
  const asciiName = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

/**
 * Swap the base64 parts of a message for metadata. The inbox polls every few seconds, so the
 * payload it reads must not carry file bytes nobody renders.
 *
 * @param {Object} message - Stored message
 * @returns {Object} - Message with described attachments
 */
const withAttachmentMetadata = (message) => ({
  ...message,
  attachments: listAttachments(message),
});

module.exports = {
  listAttachments,
  resolveAttachment,
  contentDispositionHeader,
  withAttachmentMetadata,
  safeFilename,
  safeContentType,
};
