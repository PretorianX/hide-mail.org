import axios from 'axios';
import EmailService from './EmailService';
import InboxGroupService from './InboxGroupService';
import InboxSlotService from './InboxSlotService';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../utils/powSolver', () => ({
  getProofOfWork: jest.fn(),
}));

jest.mock('./InboxSlotService', () => ({
  __esModule: true,
  default: { list: jest.fn(), release: jest.fn() },
}));

const GROUP = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const registerHeaders = () => axios.post.mock.calls
  .find(([url]) => url.endsWith('/mailbox/register'))[2].headers;

describe('EmailService and concurrent inboxes', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('hidemail_inbox_group', GROUP);
    InboxGroupService.reset();
    InboxGroupService.groupId = GROUP;

    EmailService.initialized = true;
    EmailService.domains = ['hide-mail.org'];
    EmailService.premiumDomains = [];
    EmailService.currentEmail = null;
    EmailService.expirationTime = null;
    EmailService.mailboxTtlSeconds = null;

    // eslint-disable-next-line global-require
    require('../utils/powSolver').getProofOfWork.mockResolvedValue({ nonce: 1 });
    EmailService.generateRandomLocalPart = jest.fn().mockReturnValue('someone');
    EmailService.getRandomElement = jest.fn((list) => list[0]);
    InboxSlotService.release.mockResolvedValue(undefined);
    axios.post.mockResolvedValue({ data: { success: true, data: { ttlSeconds: 1800 } } });
    axios.delete.mockResolvedValue({ data: { success: true } });
  });

  describe('openAdditionalMailbox', () => {
    it('registers another address and selects it', async () => {
      EmailService.currentEmail = 'first@hide-mail.org';

      const email = await EmailService.openAdditionalMailbox();

      expect(email).toBe('someone@hide-mail.org');
      expect(EmailService.currentEmail).toBe('someone@hide-mail.org');
    });

    it('leaves the inbox that was already open alone', async () => {
      EmailService.currentEmail = 'first@hide-mail.org';

      await EmailService.openAdditionalMailbox();

      expect(axios.post).not.toHaveBeenCalledWith(
        expect.stringContaining('/mailbox/deactivate'),
        expect.anything(),
        expect.anything()
      );
      expect(InboxSlotService.release).not.toHaveBeenCalled();
    });

    it('sends the inbox group so the slot is counted', async () => {
      await EmailService.openAdditionalMailbox();

      expect(registerHeaders()).toMatchObject({ 'X-Inbox-Group': GROUP });
    });

    it('passes the plan refusal through with the allowance that caused it', async () => {
      axios.post.mockRejectedValue({
        response: { status: 403, data: { error: 'full', code: 'SLOT_LIMIT', limit: 2 } },
      });

      await expect(EmailService.openAdditionalMailbox())
        .rejects.toMatchObject({ code: 'SLOT_LIMIT', limit: 2 });
    });
  });

  describe('generateEmail', () => {
    it('still closes the inbox it replaces', async () => {
      EmailService.currentEmail = 'old@hide-mail.org';

      await EmailService.generateEmail();

      expect(axios.post).toHaveBeenCalledWith(
        '/api/mailbox/deactivate',
        { email: 'old@hide-mail.org' },
        expect.anything()
      );
      expect(EmailService.currentEmail).toBe('someone@hide-mail.org');
    });
  });

  describe('adoptMailbox', () => {
    it('points the inbox at an address the browser already holds', () => {
      EmailService.adoptMailbox('other@hide-mail.org', {
        remainingSeconds: 600,
        lifetimeSeconds: 1800,
      });

      expect(EmailService.currentEmail).toBe('other@hide-mail.org');
      expect(EmailService.mailboxTtlSeconds).toBe(1800);
      expect(EmailService.getRemainingTime()).toBeGreaterThan(590_000);
      expect(localStorage.getItem('mailduck_current_email')).toBe('other@hide-mail.org');
    });

    it('does not replay the previous inbox lifetime when the new one is unknown', () => {
      EmailService.adoptMailbox('a@hide-mail.org', { remainingSeconds: 600, lifetimeSeconds: 604800 });
      EmailService.adoptMailbox('b@hide-mail.org', { remainingSeconds: 600, lifetimeSeconds: null });

      expect(EmailService.mailboxTtlSeconds).toBeNull();
      expect(localStorage.getItem('mailduck_mailbox_ttl')).toBeNull();
    });
  });

  describe('releaseMailbox', () => {
    it('gives the slot back', async () => {
      await EmailService.releaseMailbox('gone@hide-mail.org');

      expect(InboxSlotService.release).toHaveBeenCalledWith('gone@hide-mail.org');
    });

    it('clears the selection when the closed inbox was the one on screen', async () => {
      EmailService.adoptMailbox('gone@hide-mail.org', { remainingSeconds: 600, lifetimeSeconds: 1800 });

      await EmailService.releaseMailbox('gone@hide-mail.org');

      expect(EmailService.currentEmail).toBeNull();
      expect(localStorage.getItem('mailduck_current_email')).toBeNull();
    });

    it('keeps the selection when another inbox was closed', async () => {
      EmailService.adoptMailbox('keep@hide-mail.org', { remainingSeconds: 600, lifetimeSeconds: 1800 });

      await EmailService.releaseMailbox('other@hide-mail.org');

      expect(EmailService.currentEmail).toBe('keep@hide-mail.org');
    });
  });
});
