process.env.VALID_DOMAINS = 'hide-mail.org';

const redisService = require('../../services/redisService');
const inboxSlotService = require('../../services/inboxSlotService');

const GROUP = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('inboxSlotService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('has no slots for a group that never opened one', async () => {
    await expect(inboxSlotService.listSlots(GROUP)).resolves.toEqual([]);
  });

  it('lists a claimed inbox with the time it has left', async () => {
    await inboxSlotService.claimSlot(GROUP, 'first@hide-mail.org', { limit: 2, ttlSeconds: 1800 });
    await redisService.registerMailbox('first@hide-mail.org', 1800);

    const slots = await inboxSlotService.listSlots(GROUP);

    expect(slots).toEqual([
      expect.objectContaining({ email: 'first@hide-mail.org', remainingSeconds: 3600 }),
    ]);
  });

  it('keeps inboxes in the order they were opened', async () => {
    await inboxSlotService.claimSlot(GROUP, 'first@hide-mail.org', { limit: 5, ttlSeconds: 1800 });
    await redisService.registerMailbox('first@hide-mail.org', 1800);
    await inboxSlotService.claimSlot(GROUP, 'second@hide-mail.org', { limit: 5, ttlSeconds: 1800 });
    await redisService.registerMailbox('second@hide-mail.org', 1800);
    await inboxSlotService.claimSlot(GROUP, 'third@hide-mail.org', { limit: 5, ttlSeconds: 1800 });
    await redisService.registerMailbox('third@hide-mail.org', 1800);

    const slots = await inboxSlotService.listSlots(GROUP);

    expect(slots.map((slot) => slot.email)).toEqual([
      'first@hide-mail.org',
      'second@hide-mail.org',
      'third@hide-mail.org',
    ]);
  });

  it('refuses a claim once the group is full', async () => {
    await inboxSlotService.claimSlot(GROUP, 'one@hide-mail.org', { limit: 2, ttlSeconds: 1800 });
    await redisService.registerMailbox('one@hide-mail.org', 1800);
    await inboxSlotService.claimSlot(GROUP, 'two@hide-mail.org', { limit: 2, ttlSeconds: 1800 });
    await redisService.registerMailbox('two@hide-mail.org', 1800);

    await expect(
      inboxSlotService.claimSlot(GROUP, 'three@hide-mail.org', { limit: 2, ttlSeconds: 1800 })
    ).rejects.toMatchObject({ code: 'SLOT_LIMIT' });
  });

  it('reports how much of the allowance a claim used', async () => {
    const claim = await inboxSlotService.claimSlot(GROUP, 'one@hide-mail.org', {
      limit: 2,
      ttlSeconds: 1800,
    });

    expect(claim).toEqual({ used: 1, limit: 2 });
  });

  it('drops a member whose mailbox lease has gone and frees the allowance', async () => {
    await inboxSlotService.claimSlot(GROUP, 'gone@hide-mail.org', { limit: 1, ttlSeconds: 1800 });

    await expect(inboxSlotService.listSlots(GROUP)).resolves.toEqual([]);
    await expect(
      inboxSlotService.claimSlot(GROUP, 'fresh@hide-mail.org', { limit: 1, ttlSeconds: 1800 })
    ).resolves.toEqual({ used: 1, limit: 1 });
  });

  it('releases a member of the group', async () => {
    await inboxSlotService.claimSlot(GROUP, 'bye@hide-mail.org', { limit: 2, ttlSeconds: 1800 });
    await redisService.registerMailbox('bye@hide-mail.org', 1800);

    await inboxSlotService.releaseSlot(GROUP, 'bye@hide-mail.org');

    await expect(inboxSlotService.listSlots(GROUP)).resolves.toEqual([]);
  });

  it('refuses to release an address the group does not hold', async () => {
    await inboxSlotService.claimSlot(GROUP, 'mine@hide-mail.org', { limit: 2, ttlSeconds: 1800 });
    await redisService.registerMailbox('mine@hide-mail.org', 1800);
    await redisService.registerMailbox('someone-else@hide-mail.org', 1800);

    await expect(
      inboxSlotService.releaseSlot(GROUP, 'someone-else@hide-mail.org')
    ).rejects.toMatchObject({ code: 'SLOT_NOT_FOUND' });

    await expect(redisService.isMailboxActive('someone-else@hide-mail.org')).resolves.toBe(true);
  });

  it('forgets the group once its last inbox is released', async () => {
    await inboxSlotService.claimSlot(GROUP, 'only@hide-mail.org', { limit: 2, ttlSeconds: 1800 });
    await redisService.registerMailbox('only@hide-mail.org', 1800);

    await inboxSlotService.releaseSlot(GROUP, 'only@hide-mail.org');

    await expect(redisService.client.exists(`inbox_slots:${GROUP}`)).resolves.toBe(0);
  });

  it('keeps groups apart', async () => {
    const other = 'ffffffffffffffffffffffffffffffff';
    await inboxSlotService.claimSlot(GROUP, 'mine@hide-mail.org', { limit: 2, ttlSeconds: 1800 });
    await redisService.registerMailbox('mine@hide-mail.org', 1800);

    await expect(inboxSlotService.listSlots(other)).resolves.toEqual([]);
  });

  it('reports the lifetime a mailbox was created with, not just what is left', async () => {
    await inboxSlotService.claimSlot(GROUP, 'pro@hide-mail.org', { limit: 10, ttlSeconds: 86400 });
    await redisService.registerMailbox('pro@hide-mail.org', 86400);
    await redisService.setMailboxMeta('pro@hide-mail.org', { lifetimeSeconds: 86400 }, 86400);

    const [slot] = await inboxSlotService.listSlots(GROUP);

    expect(slot.lifetimeSeconds).toBe(86400);
  });
});
