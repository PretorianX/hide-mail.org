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

  it('listSuppressions and getSuppression round-trip reason, errorMessage, and addedAt', async () => {
    await suppressionService.addSuppression({
      accountId: 'a1',
      email: 'to@example.org',
      reason: 'hard_bounce',
      errorMessage: '550 5.0.0 550 Unrouteable address',
    });
    const list = await suppressionService.listSuppressions({ accountId: 'a1' });
    expect(list).toEqual([
      expect.objectContaining({
        email: 'to@example.org',
        reason: 'hard_bounce',
        errorMessage: '550 5.0.0 550 Unrouteable address',
        addedAt: expect.any(Number),
      }),
    ]);
    await expect(
      suppressionService.getSuppression({ accountId: 'a1', email: 'TO@example.org' })
    ).resolves.toEqual(
      expect.objectContaining({
        email: 'to@example.org',
        reason: 'hard_bounce',
        errorMessage: '550 5.0.0 550 Unrouteable address',
      })
    );
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

  it('CSV export escapes RFC 4180 delimiters and neutralizes formula prefixes', async () => {
    await suppressionService.addSuppression({
      accountId: 'a1',
      email: '=cmd|"/C calc"!A0',
      reason: 'hard_bounce, "550"\nnext',
    });
    await suppressionService.addSuppression({
      accountId: 'a1',
      email: '@SUM(1+1)',
      reason: '=2+5',
    });
    const csv = await suppressionService.exportSuppressionsCsv({ accountId: 'a1' });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('email,reason,added_at');
    expect(csv).toContain(`"'=cmd|""/c calc""!a0","hard_bounce, ""550""\nnext",`);
    expect(csv).toContain(`'@sum(1+1),'=2+5,`);
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
