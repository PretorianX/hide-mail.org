import axios from 'axios';
import { licenseHeaders } from './apiHeaders';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const STORAGE_KEY = 'hidemail_inbox_group';

/**
 * The inbox group is what lets one browser hold several live inboxes at once. It is minted by
 * the API, not here, so it cannot be guessed; this class only remembers it.
 *
 * The in-memory copy is authoritative for the session and localStorage is how it survives a
 * reload — the same arrangement EmailService uses for the current address.
 */
class InboxGroupService {
  static groupId = null;

  static readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Inbox group could not be read from storage:', error);
      return null;
    }
  }

  static persist(groupId) {
    try {
      localStorage.setItem(STORAGE_KEY, groupId);
    } catch (error) {
      console.warn('Inbox group will last this session only:', error);
    }
  }

  static async ensureGroupId() {
    if (this.groupId) {
      return this.groupId;
    }

    const stored = this.readStored();
    if (stored) {
      this.groupId = stored;
      return stored;
    }

    const response = await axios.post(
      `${API_URL}/mailbox/slots/group`,
      {},
      { headers: licenseHeaders() }
    );

    const groupId = response.data?.data?.groupId;
    if (!groupId) {
      throw new Error('The server did not issue an inbox group');
    }

    this.groupId = groupId;
    this.persist(groupId);
    return groupId;
  }

  static reset() {
    this.groupId = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Inbox group could not be cleared from storage:', error);
    }
  }
}

export default InboxGroupService;
