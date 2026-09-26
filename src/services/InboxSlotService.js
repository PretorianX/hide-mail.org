import axios from 'axios';
import InboxGroupService from './InboxGroupService';
import { inboxGroupHeaders } from './apiHeaders';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const asError = (error, fallbackMessage) => {
  const payload = error.response?.data || {};
  const wrapped = new Error(payload.error || error.message || fallbackMessage);
  wrapped.code = payload.code || error.code;
  wrapped.httpStatus = error.response?.status;
  return wrapped;
};

/**
 * Reads and gives back the concurrent inboxes this browser holds. The server is the only source
 * of truth for which of them are still alive, so nothing about the set is cached here.
 */
class InboxSlotService {
  /**
   * @returns {Promise<{slots: Array, used: number, limit: number, planType: string}>}
   */
  static async list() {
    const groupId = await InboxGroupService.ensureGroupId();

    try {
      const response = await axios.get(`${API_URL}/mailbox/slots`, {
        headers: inboxGroupHeaders(groupId),
      });
      return response.data.data;
    } catch (error) {
      throw asError(error, 'Could not read your inboxes');
    }
  }

  /**
   * Close one inbox and hand its slot back.
   *
   * @param {string} email - Address to close
   */
  static async release(email) {
    const groupId = await InboxGroupService.ensureGroupId();

    try {
      await axios.delete(`${API_URL}/mailbox/slots/${encodeURIComponent(email)}`, {
        headers: inboxGroupHeaders(groupId),
      });
    } catch (error) {
      throw asError(error, 'Could not close that inbox');
    }
  }
}

export default InboxSlotService;
