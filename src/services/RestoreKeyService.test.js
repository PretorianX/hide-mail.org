import axios from 'axios';
import RestoreKeyService from './RestoreKeyService';

jest.mock('axios', () => ({
  post: jest.fn(),
  delete: jest.fn(),
}));

describe('RestoreKeyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('issue', () => {
    test('asks the backend for the key of a mailbox', async () => {
      axios.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            key: 'HMR-4F7K-2QMT-9XB3',
            email: 'jane@hide-mail.org',
            ttlSeconds: 1800,
            expiresAt: '2026-09-12T10:00:00.000Z',
          },
        },
      });

      const result = await RestoreKeyService.issue('jane@hide-mail.org');

      expect(axios.post).toHaveBeenCalledWith(
        '/api/mailbox/restore-key',
        { email: 'jane@hide-mail.org', rotate: false },
        expect.any(Object)
      );
      expect(result.key).toBe('HMR-4F7K-2QMT-9XB3');
      expect(result.ttlSeconds).toBe(1800);
    });

    test('asks for a replacement when rotating', async () => {
      axios.post.mockResolvedValue({
        data: { success: true, data: { key: 'HMR-0000-0000-0001', ttlSeconds: 60 } },
      });

      await RestoreKeyService.issue('jane@hide-mail.org', { rotate: true });

      expect(axios.post).toHaveBeenCalledWith(
        '/api/mailbox/restore-key',
        { email: 'jane@hide-mail.org', rotate: true },
        expect.any(Object)
      );
    });

    test('surfaces the backend code so the panel can explain itself', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'This inbox is no longer active, so it cannot be reopened.', code: 'MAILBOX_NOT_ACTIVE' },
        },
      });

      await expect(RestoreKeyService.issue('jane@hide-mail.org')).rejects.toMatchObject({
        code: 'MAILBOX_NOT_ACTIVE',
        message: 'This inbox is no longer active, so it cannot be reopened.',
      });
    });
  });

  describe('redeem', () => {
    test('exchanges a key for a mailbox', async () => {
      axios.post.mockResolvedValue({
        data: {
          success: true,
          data: { email: 'jane@hide-mail.org', ttlSeconds: 1200, expiresAt: '2026-09-12T10:00:00.000Z' },
        },
      });

      const result = await RestoreKeyService.redeem(' hmr-4f7k-2qmt-9xb3 ');

      expect(axios.post).toHaveBeenCalledWith(
        '/api/mailbox/restore',
        { key: 'hmr-4f7k-2qmt-9xb3' },
        expect.any(Object)
      );
      expect(result).toEqual({
        email: 'jane@hide-mail.org',
        ttlSeconds: 1200,
        expiresAt: '2026-09-12T10:00:00.000Z',
      });
    });

    test('reports an unknown key with its code', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 404,
          data: {
            error: 'That restore key does not match a live inbox. It may have expired.',
            code: 'RESTORE_KEY_UNKNOWN',
          },
        },
      });

      await expect(RestoreKeyService.redeem('HMR-4F7K-2QMT-9XB3')).rejects.toMatchObject({
        code: 'RESTORE_KEY_UNKNOWN',
      });
    });
  });

  describe('revoke', () => {
    test('deletes the key of a mailbox', async () => {
      axios.delete.mockResolvedValue({ data: { success: true, data: { revoked: true } } });

      await expect(RestoreKeyService.revoke('jane@hide-mail.org')).resolves.toBe(true);

      expect(axios.delete).toHaveBeenCalledWith(
        '/api/mailbox/restore-key',
        expect.objectContaining({ data: { email: 'jane@hide-mail.org' } })
      );
    });
  });
});
