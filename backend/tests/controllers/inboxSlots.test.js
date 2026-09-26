process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';
process.env.INBOX_SLOTS_FREE_LIMIT = '2';
process.env.INBOX_SLOTS_PRO_LIMIT = '10';

const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const entitlementService = require('../../services/entitlementService');
const inboxSlotService = require('../../services/inboxSlotService');
const inboxSlotController = require('../../controllers/inboxSlotController');
const emailController = require('../../controllers/emailController');

const GROUP = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const jsonRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const rethrow = (err) => { throw err; };

const request = ({ groupId, license, body = {}, params = {} } = {}) => ({
  headers: groupId ? { 'x-inbox-group': groupId } : {},
  body,
  params,
  license: license || null,
  entitlements: entitlementService.getEntitlements(license || null),
});

const openInbox = async (email, req = {}) => {
  const res = jsonRes();
  await emailController.registerMailbox(
    request({ ...req, body: { email, ...(req.body || {}) } }),
    res,
    rethrow
  );
  return res;
};

describe('inbox slot endpoints', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org']);
  });

  describe('POST /api/mailbox/slots/group', () => {
    it('issues a group id and states the allowance for the caller', async () => {
      const res = jsonRes();

      await inboxSlotController.createGroup(request(), res, rethrow);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.groupId).toMatch(/^[0-9a-f]{32}$/);
      expect(res.body.data.limit).toBe(2);
      expect(res.body.data.planType).toBe('free');
    });

    it('states the larger Pro allowance for a licence holder', async () => {
      const license = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'slots-pro',
        ttlSeconds: 3600,
      });
      const res = jsonRes();

      await inboxSlotController.createGroup(request({ license }), res, rethrow);

      expect(res.body.data.limit).toBe(10);
      expect(res.body.data.planType).toBe('pro');
    });
  });

  describe('GET /api/mailbox/slots', () => {
    it('rejects a request without a group', async () => {
      const res = jsonRes();

      await inboxSlotController.listSlots(request(), res, rethrow);

      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('INBOX_GROUP_REQUIRED');
    });

    it('lists the inboxes the group holds', async () => {
      await openInbox('one@hide-mail.org', { groupId: GROUP });
      await openInbox('two@hide-mail.org', { groupId: GROUP });
      const res = jsonRes();

      await inboxSlotController.listSlots(request({ groupId: GROUP }), res, rethrow);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.slots.map((slot) => slot.email)).toEqual([
        'one@hide-mail.org',
        'two@hide-mail.org',
      ]);
      expect(res.body.data.used).toBe(2);
      expect(res.body.data.limit).toBe(2);
    });
  });

  describe('DELETE /api/mailbox/slots/:email', () => {
    it('deactivates the mailbox and frees the slot', async () => {
      await openInbox('bye@hide-mail.org', { groupId: GROUP });
      const res = jsonRes();

      await inboxSlotController.releaseSlot(
        request({ groupId: GROUP, params: { email: 'bye@hide-mail.org' } }),
        res,
        rethrow
      );

      expect(res.statusCode).toBe(200);
      expect(await redisService.isMailboxActive('bye@hide-mail.org')).toBe(false);
      await expect(inboxSlotService.listSlots(GROUP)).resolves.toEqual([]);
    });

    it('will not deactivate a mailbox the group does not hold', async () => {
      await redisService.registerMailbox('stranger@hide-mail.org', 1800);
      const res = jsonRes();

      await inboxSlotController.releaseSlot(
        request({ groupId: GROUP, params: { email: 'stranger@hide-mail.org' } }),
        res,
        rethrow
      );

      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('SLOT_NOT_FOUND');
      expect(await redisService.isMailboxActive('stranger@hide-mail.org')).toBe(true);
    });
  });

  describe('registering into a group', () => {
    it('opens a second inbox without touching the first', async () => {
      await openInbox('first@hide-mail.org', { groupId: GROUP });
      const res = await openInbox('second@hide-mail.org', { groupId: GROUP });

      expect(res.statusCode).toBe(200);
      expect(await redisService.isMailboxActive('first@hide-mail.org')).toBe(true);
      expect(await redisService.isMailboxActive('second@hide-mail.org')).toBe(true);
    });

    it('refuses the third inbox on a free plan', async () => {
      await openInbox('one@hide-mail.org', { groupId: GROUP });
      await openInbox('two@hide-mail.org', { groupId: GROUP });

      const res = await openInbox('three@hide-mail.org', { groupId: GROUP });

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('SLOT_LIMIT');
      expect(res.body.limit).toBe(2);
    });

    it('never registers the mailbox it refused', async () => {
      await openInbox('one@hide-mail.org', { groupId: GROUP });
      await openInbox('two@hide-mail.org', { groupId: GROUP });

      await openInbox('three@hide-mail.org', { groupId: GROUP });

      expect(await redisService.isMailboxActive('three@hide-mail.org')).toBe(false);
      expect(await redisService.isMailboxKnown('three@hide-mail.org')).toBe(false);
    });

    it('lets a Pro licence hold more than the free allowance', async () => {
      const license = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'slots-pro-register',
        ttlSeconds: 3600,
      });

      await openInbox('one@hide-mail.org', { groupId: GROUP, license });
      await openInbox('two@hide-mail.org', { groupId: GROUP, license });
      const res = await openInbox('three@hide-mail.org', { groupId: GROUP, license });

      expect(res.statusCode).toBe(200);
      await expect(inboxSlotService.listSlots(GROUP)).resolves.toHaveLength(3);
    });

    it('records the lifetime the mailbox was created with', async () => {
      await openInbox('meta@hide-mail.org', { groupId: GROUP });

      const meta = await redisService.getMailboxMeta('meta@hide-mail.org');

      expect(meta.lifetimeSeconds).toBe(1800);
    });

    it('registers normally when the caller sends no group', async () => {
      const res = await openInbox('loner@hide-mail.org');

      expect(res.statusCode).toBe(200);
      expect(await redisService.isMailboxActive('loner@hide-mail.org')).toBe(true);
    });

    it('ignores a malformed group rather than tracking a slot under it', async () => {
      const res = await openInbox('bad@hide-mail.org', { groupId: 'not-a-group' });

      expect(res.statusCode).toBe(200);
      await expect(inboxSlotService.listSlots('not-a-group')).resolves.toEqual([]);
    });
  });
});
