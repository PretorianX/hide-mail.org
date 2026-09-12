process.env.VALID_DOMAINS = 'domain1.com,domain2.com';

const restoreKeyService = require('../../services/restoreKeyService');
const metrics = require('../../services/metricsService');
const restoreKeyController = require('../../controllers/restoreKeyController');

jest.mock('../../services/restoreKeyService');

const mockResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe('restoreKeyController', () => {
  const mailbox = 'jane.doe@domain1.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('issue', () => {
    it('answers with the key, its lifetime and when it dies', async () => {
      restoreKeyService.issue.mockResolvedValue({
        key: 'HMR-4F7K-2QMT-9XB3',
        email: mailbox,
        ttlSeconds: 1800,
        created: true,
      });
      const res = mockResponse();

      await restoreKeyController.issue({ body: { email: mailbox } }, res, jest.fn());

      expect(restoreKeyService.issue).toHaveBeenCalledWith(mailbox, { rotate: false });
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.key).toBe('HMR-4F7K-2QMT-9XB3');
      expect(payload.data.email).toBe(mailbox);
      expect(payload.data.ttlSeconds).toBe(1800);
      expect(Date.parse(payload.data.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('counts only newly created keys', async () => {
      restoreKeyService.issue.mockResolvedValue({
        key: 'HMR-4F7K-2QMT-9XB3',
        email: mailbox,
        ttlSeconds: 1800,
        created: false,
      });

      await restoreKeyController.issue({ body: { email: mailbox } }, mockResponse(), jest.fn());

      expect(metrics.restoreKeysIssuedTotal.inc).not.toHaveBeenCalled();

      restoreKeyService.issue.mockResolvedValue({
        key: 'HMR-4F7K-2QMT-9XB3',
        email: mailbox,
        ttlSeconds: 1800,
        created: true,
      });

      await restoreKeyController.issue({ body: { email: mailbox } }, mockResponse(), jest.fn());

      expect(metrics.restoreKeysIssuedTotal.inc).toHaveBeenCalledTimes(1);
    });

    it('passes a rotation request through', async () => {
      restoreKeyService.issue.mockResolvedValue({
        key: 'HMR-0000-0000-0000',
        email: mailbox,
        ttlSeconds: 60,
        created: true,
      });

      await restoreKeyController.issue(
        { body: { email: mailbox, rotate: true } },
        mockResponse(),
        jest.fn()
      );

      expect(restoreKeyService.issue).toHaveBeenCalledWith(mailbox, { rotate: true });
    });

    it('rejects a body without a usable address', async () => {
      const res = mockResponse();

      await restoreKeyController.issue({ body: { email: 'not-an-address' } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(restoreKeyService.issue).not.toHaveBeenCalled();
    });

    it('reports a mailbox that can no longer hold a key', async () => {
      restoreKeyService.issue.mockRejectedValue(new Error('MAILBOX_NOT_ACTIVE'));
      const res = mockResponse();

      await restoreKeyController.issue({ body: { email: mailbox } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This inbox is no longer active, so it cannot be reopened.',
        code: 'MAILBOX_NOT_ACTIVE',
      });
    });

    it('hands unexpected failures to the error middleware', async () => {
      const failure = new Error('redis down');
      restoreKeyService.issue.mockRejectedValue(failure);
      const next = jest.fn();

      await restoreKeyController.issue({ body: { email: mailbox } }, mockResponse(), next);

      expect(next).toHaveBeenCalledWith(failure);
    });
  });

  describe('redeem', () => {
    it('answers with the mailbox behind the key', async () => {
      restoreKeyService.redeem.mockResolvedValue({ email: mailbox, ttlSeconds: 1200 });
      const res = mockResponse();

      await restoreKeyController.redeem({ body: { key: 'hmr-4f7k-2qmt-9xb3' } }, res, jest.fn());

      expect(restoreKeyService.redeem).toHaveBeenCalledWith('hmr-4f7k-2qmt-9xb3');
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data.email).toBe(mailbox);
      expect(payload.data.ttlSeconds).toBe(1200);
      expect(Date.parse(payload.data.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('does not leak whether an unknown key was merely malformed', async () => {
      restoreKeyService.redeem.mockResolvedValue(null);
      const res = mockResponse();

      await restoreKeyController.redeem({ body: { key: 'whatever' } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'That restore key does not match a live inbox. It may have expired.',
        code: 'RESTORE_KEY_UNKNOWN',
      });
    });

    it('counts redemptions by outcome', async () => {
      restoreKeyService.redeem.mockResolvedValue({ email: mailbox, ttlSeconds: 60 });
      await restoreKeyController.redeem({ body: { key: 'k' } }, mockResponse(), jest.fn());
      restoreKeyService.redeem.mockResolvedValue(null);
      await restoreKeyController.redeem({ body: { key: 'k' } }, mockResponse(), jest.fn());

      expect(metrics.restoreKeysRedeemedTotal.inc).toHaveBeenCalledWith({ result: 'ok' });
      expect(metrics.restoreKeysRedeemedTotal.inc).toHaveBeenCalledWith({ result: 'unknown' });
    });
  });

  describe('revoke', () => {
    it('reports that the key is gone', async () => {
      restoreKeyService.revoke.mockResolvedValue(true);
      const res = mockResponse();

      await restoreKeyController.revoke({ body: { email: mailbox } }, res, jest.fn());

      expect(restoreKeyService.revoke).toHaveBeenCalledWith(mailbox);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { revoked: true } });
    });

    it('rejects a body without a usable address', async () => {
      const res = mockResponse();

      await restoreKeyController.revoke({ body: {} }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(restoreKeyService.revoke).not.toHaveBeenCalled();
    });
  });
});
