jest.mock('../../services/redisService', () => ({
  isMailboxActive: jest.fn(),
  isMailboxKnown: jest.fn(),
}));

const redisService = require('../../services/redisService');
const {
  resolveActiveRecipient,
  resolveKnownRecipient,
} = require('../../services/recipientResolver');

describe('recipientResolver', () => {
  beforeEach(() => {
    redisService.isMailboxActive.mockReset();
    redisService.isMailboxKnown.mockReset();
  });

  const activeMailboxes = (...addresses) => {
    redisService.isMailboxActive.mockImplementation(async (address) => addresses.includes(address));
  };

  it('resolves a plain recipient to itself with no label', async () => {
    activeMailboxes('nova7@hide-mail.org');

    await expect(resolveActiveRecipient('nova7@hide-mail.org')).resolves.toEqual({
      mailbox: 'nova7@hide-mail.org',
      label: null,
    });
  });

  it('routes a site address into the mailbox that owns it', async () => {
    activeMailboxes('nova7@hide-mail.org');

    await expect(resolveActiveRecipient('nova7.netflix@hide-mail.org')).resolves.toEqual({
      mailbox: 'nova7@hide-mail.org',
      label: 'netflix',
    });
  });

  it('prefers a mailbox spelled in full over a sub-address route', async () => {
    activeMailboxes('john.doe@hide-mail.org', 'john@hide-mail.org');

    await expect(resolveActiveRecipient('john.doe@hide-mail.org')).resolves.toEqual({
      mailbox: 'john.doe@hide-mail.org',
      label: null,
    });
  });

  it('routes into a dotted custom alias before falling back to a shorter one', async () => {
    activeMailboxes('john.doe@hide-mail.org', 'john@hide-mail.org');

    await expect(resolveActiveRecipient('john.doe.shop@hide-mail.org')).resolves.toEqual({
      mailbox: 'john.doe@hide-mail.org',
      label: 'shop',
    });
  });

  it('resolves nothing when no candidate mailbox is active', async () => {
    activeMailboxes();

    await expect(resolveActiveRecipient('nova7.netflix@hide-mail.org')).resolves.toBeNull();
  });

  it('stops looking as soon as a mailbox matches', async () => {
    activeMailboxes('nova7.netflix@hide-mail.org');

    await resolveActiveRecipient('nova7.netflix@hide-mail.org');

    expect(redisService.isMailboxActive).toHaveBeenCalledTimes(1);
  });

  it('resolves known mailboxes separately, so the grace period still applies', async () => {
    redisService.isMailboxKnown.mockImplementation(async (address) => address === 'nova7@hide-mail.org');

    await expect(resolveKnownRecipient('nova7.shop@hide-mail.org')).resolves.toEqual({
      mailbox: 'nova7@hide-mail.org',
      label: 'shop',
    });
    expect(redisService.isMailboxActive).not.toHaveBeenCalled();
  });
});
