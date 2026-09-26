import axios from 'axios';
import InboxSlotService from './InboxSlotService';
import InboxGroupService from './InboxGroupService';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}));

const GROUP = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('InboxSlotService', () => {
  beforeEach(() => {
    InboxGroupService.reset();
    localStorage.setItem('hidemail_inbox_group', GROUP);
    axios.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          slots: [{ email: 'one@hide-mail.org', remainingSeconds: 1500, lifetimeSeconds: 1800 }],
          used: 1,
          limit: 2,
          planType: 'free',
        },
      },
    });
    axios.delete.mockResolvedValue({ data: { success: true } });
  });

  it('lists the slots the group holds', async () => {
    const result = await InboxSlotService.list();

    expect(result.slots).toHaveLength(1);
    expect(result.limit).toBe(2);
    expect(axios.get).toHaveBeenCalledWith(
      '/api/mailbox/slots',
      { headers: expect.objectContaining({ 'X-Inbox-Group': GROUP }) }
    );
  });

  it('releases one inbox by address', async () => {
    await InboxSlotService.release('one@hide-mail.org');

    expect(axios.delete).toHaveBeenCalledWith(
      '/api/mailbox/slots/one%40hide-mail.org',
      { headers: expect.objectContaining({ 'X-Inbox-Group': GROUP }) }
    );
  });

  it('reports a refused release instead of swallowing it', async () => {
    axios.delete.mockRejectedValue({
      response: { status: 404, data: { error: 'not yours', code: 'SLOT_NOT_FOUND' } },
    });

    await expect(InboxSlotService.release('other@hide-mail.org'))
      .rejects.toMatchObject({ code: 'SLOT_NOT_FOUND' });
  });
});
