import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const encode = encodeURIComponent;

/** Re-throw an axios failure as a plain Error carrying the backend's error code. */
const asReplyError = (error, fallback) => {
  const data = error.response?.data || {};
  const replyError = new Error(data.error || fallback);
  replyError.code = data.code;
  replyError.upgradeUrl = data.upgradeUrl;
  throw replyError;
};

/**
 * Replying to a message from the temporary address that received it.
 *
 * The recipient is never sent from here: the backend resolves it from the stored message, which
 * is what stops the endpoint from being usable as a relay.
 */
class ReplyService {
  /** Remaining replies, limits and whether replying is possible for this address. */
  static async getStatus(mailbox) {
    const response = await axios.get(`${API_URL}/reply/status/${encode(mailbox)}`);
    return response.data.data;
  }

  /** Replies already sent for a message, newest last. */
  static async listReplies(mailbox, messageId) {
    const response = await axios.get(`${API_URL}/reply/${encode(mailbox)}/${encode(messageId)}`);
    return response.data.data;
  }

  /** Send a plain-text reply. Resolves with the recipient and the remaining allowance. */
  static async sendReply(mailbox, messageId, body) {
    try {
      const response = await axios.post(
        `${API_URL}/reply/${encode(mailbox)}/${encode(messageId)}`,
        { body }
      );
      return response.data.data;
    } catch (error) {
      return asReplyError(error, 'Failed to send your reply');
    }
  }
}

export default ReplyService;
