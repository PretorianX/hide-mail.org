import axios from 'axios';
import InboxGroupService from './InboxGroupService';
import LicenseService from './LicenseService';

jest.mock('axios');

const GROUP = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('InboxGroupService', () => {
  beforeEach(() => {
    InboxGroupService.reset();
    localStorage.clear();
    axios.post.mockResolvedValue({ data: { success: true, data: { groupId: GROUP, limit: 2 } } });
  });

  it('asks the API for a group the first time and keeps it', async () => {
    const groupId = await InboxGroupService.ensureGroupId();

    expect(groupId).toBe(GROUP);
    expect(axios.post).toHaveBeenCalledWith(
      '/api/mailbox/slots/group',
      {},
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(localStorage.getItem('hidemail_inbox_group')).toBe(GROUP);
  });

  it('does not ask twice in one session', async () => {
    await InboxGroupService.ensureGroupId();
    await InboxGroupService.ensureGroupId();

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('reuses the group a previous visit stored', async () => {
    localStorage.setItem('hidemail_inbox_group', GROUP);

    await expect(InboxGroupService.ensureGroupId()).resolves.toBe(GROUP);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refuses to invent a group when the API returns none', async () => {
    axios.post.mockResolvedValue({ data: { success: true, data: {} } });

    await expect(InboxGroupService.ensureGroupId()).rejects.toThrow(/inbox group/i);
  });

  it('sends the license key so the answer is sized for the plan', async () => {
    LicenseService.saveKey('HM-TEST-KEY');

    await InboxGroupService.ensureGroupId();

    expect(axios.post).toHaveBeenCalledWith(
      '/api/mailbox/slots/group',
      {},
      { headers: expect.objectContaining({ 'X-License-Key': 'HM-TEST-KEY' }) }
    );
  });

  it('still works for the session when storage is unavailable', async () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('storage disabled');
    };

    try {
      await expect(InboxGroupService.ensureGroupId()).resolves.toBe(GROUP);
      await expect(InboxGroupService.ensureGroupId()).resolves.toBe(GROUP);
      expect(axios.post).toHaveBeenCalledTimes(1);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
