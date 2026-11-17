process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const suppressionService = require('../../../services/outbound/suppressionService');

describe('outbound suppressionService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('add then isSuppressed is true; remove then false', async () => {
    await suppressionService.addSuppression({
      accountId: 'a1',
      email: 'X@Example.org',
      reason: 'hard_bounce',
    });
    await expect(
      suppressionService.isSuppressed({ accountId: 'a1', email: 'x@example.org' })
    ).resolves.toBe(true);

    await expect(
      suppressionService.removeSuppression({ accountId: 'a1', email: 'x@example.org' })
    ).resolves.toBe(true);
    await expect(
      suppressionService.isSuppressed({ accountId: 'a1', email: 'x@example.org' })
    ).resolves.toBe(false);
  });

  it('listSuppressions round-trips reason and addedAt', async () => {
    await suppressionService.addSuppression({
      accountId: 'a1',
      email: 'to@example.org',
      reason: 'manual',
    });
    const list = await suppressionService.listSuppressions({ accountId: 'a1' });
    expect(list).toEqual([
      expect.objectContaining({
        email: 'to@example.org',
        reason: 'manual',
        addedAt: expect.any(Number),
      }),
    ]);
  });

  it('CSV export header and one data row match exactly', async () => {
    await suppressionService.addSuppression({
      accountId: 'a1',
      email: 'to@example.org',
      reason: 'hard_bounce',
    });
    const list = await suppressionService.listSuppressions({ accountId: 'a1' });
    const csv = await suppressionService.exportSuppressionsCsv({ accountId: 'a1' });
    expect(csv).toBe(`email,reason,added_at\nto@example.org,hard_bounce,${list[0].addedAt}`);
  });

  it('scopes suppression per account', async () => {
    await suppressionService.addSuppression({
      accountId: 'a1',
      email: 'x@example.org',
      reason: 'hard_bounce',
    });
    await expect(
      suppressionService.isSuppressed({ accountId: 'b1', email: 'x@example.org' })
    ).resolves.toBe(false);
  });
});
