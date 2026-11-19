process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';

const redisService = require('../../services/redisService');

describe('redisService email TTL preservation and deletion', () => {
  const mailbox = 'ttl-test@hide-mail.org';

  beforeEach(async () => {
    redisService.client.data = {};
    if (redisService.client.ttls) {
      redisService.client.ttls = {};
    }
    await redisService.initializeDomains(['hide-mail.org']);
    await redisService.registerMailbox(mailbox, 1800);
  });

  it('preserves the message TTL when getEmailById marks a message as read', async () => {
    await redisService.storeEmail(mailbox, {
      id: 'msg-ttl-1',
      from: 'sender@example.test',
      subject: 'Hello',
      text: 'Body',
      read: false,
      receivedAt: new Date().toISOString(),
    });

    const emailKey = `email:${mailbox}:msg-ttl-1`;
    const ttlBefore = await redisService.client.ttl(emailKey);
    expect(ttlBefore).toBeGreaterThan(0);

    const setSpy = jest.spyOn(redisService.client, 'set');
    const fetched = await redisService.getEmailById(mailbox, 'msg-ttl-1');

    expect(fetched).not.toBeNull();
    expect(fetched.read).toBe(true);
    expect(setSpy).toHaveBeenCalledWith(emailKey, expect.any(String), 'KEEPTTL');

    const ttlAfter = await redisService.client.ttl(emailKey);
    expect(ttlAfter).toBeGreaterThan(0);
    setSpy.mockRestore();
  });

  it('deleteEmail removes both the list entry and the email:<mailbox>:<id> object', async () => {
    await redisService.storeEmail(mailbox, {
      id: 'msg-del-1',
      from: 'a@example.test',
      subject: 'One',
      receivedAt: new Date().toISOString(),
    });
    await redisService.storeEmail(mailbox, {
      id: 'msg-del-2',
      from: 'b@example.test',
      subject: 'Two',
      receivedAt: new Date().toISOString(),
    });

    const deleted = await redisService.deleteEmail(mailbox, 'msg-del-1');
    expect(deleted).toBe(true);

    expect(await redisService.client.get(`email:${mailbox}:msg-del-1`)).toBeNull();
    expect(await redisService.client.lrange(`emails:${mailbox}`, 0, -1)).toEqual(['msg-del-2']);
    expect(await redisService.client.get(`email:${mailbox}:msg-del-2`)).not.toBeNull();

    expect(await redisService.deleteEmail(mailbox, 'does-not-exist')).toBe(false);
  });

  it('deleteAllEmails removes emails:<mailbox> and every email:<mailbox>:<id> key', async () => {
    await redisService.storeEmail(mailbox, {
      id: 'msg-all-1',
      from: 'a@example.test',
      subject: 'One',
      receivedAt: new Date().toISOString(),
    });
    await redisService.storeEmail(mailbox, {
      id: 'msg-all-2',
      from: 'b@example.test',
      subject: 'Two',
      receivedAt: new Date().toISOString(),
    });

    const result = await redisService.deleteAllEmails(mailbox);
    expect(result).toBe(true);

    expect(await redisService.client.lrange(`emails:${mailbox}`, 0, -1)).toEqual([]);
    expect(await redisService.client.keys(`email:${mailbox}:*`)).toEqual([]);
    expect(await redisService.getEmails(mailbox)).toEqual([]);
  });
});
