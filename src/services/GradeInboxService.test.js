import axios from 'axios';
import GradeInboxService from './GradeInboxService';
import { getProofOfWork } from '../utils/powSolver';

jest.mock('axios');
jest.mock('../utils/powSolver', () => ({
  getProofOfWork: jest.fn(),
}));

describe('GradeInboxService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    axios.get.mockReset();
    axios.post.mockReset();
    getProofOfWork.mockReset();
  });

  test('mints a grade-* address without touching EmailService storage keys', async () => {
    axios.get.mockResolvedValueOnce({ data: { data: ['hide-mail.org'] } });
    getProofOfWork.mockResolvedValueOnce({ challenge: 'c', nonce: '1' });
    axios.post.mockResolvedValueOnce({ data: { data: { ttlSeconds: 1800 } } });

    const email = await GradeInboxService.createAddress();

    expect(email).toMatch(/^grade-[a-f0-9]+@hide-mail\.org$/);
    expect(axios.post).toHaveBeenCalledWith(
      '/api/mailbox/register',
      expect.objectContaining({ email, pow: { challenge: 'c', nonce: '1' } }),
      expect.any(Object)
    );
    expect(localStorage.getItem('mailduck_current_email')).toBeNull();
    expect(GradeInboxService.getStoredAddress()).toBe(email);
  });

  test('returns raw body for grading', async () => {
    axios.get.mockResolvedValueOnce({
      data: { success: true, data: { body: 'From: a@b.com\nSubject: Hi\n\nBody' } },
    });

    const raw = await GradeInboxService.getRawSource('grade-1@hide-mail.org', 'msg-1');
    expect(raw).toContain('From: a@b.com');
  });

  test('rejects messages without raw source', async () => {
    axios.get.mockResolvedValueOnce({
      data: { success: true, data: { subject: 'Hi' } },
    });

    await expect(GradeInboxService.getRawSource('grade-1@hide-mail.org', 'msg-1'))
      .rejects.toThrow(/no raw source/i);
  });
});
