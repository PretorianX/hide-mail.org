process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.PREMIUM_DOMAINS = 'pro-hide-mail.org,vip.hide-mail.org';
process.env.FORWARDING_FREE_LIMIT = '2';

const redisService = require('../../services/redisService');
const otpService = require('../../services/otpService');
const smtpService = require('../../services/smtpService');
const rateLimiter = require('../../services/rateLimiter');
const forwardingService = require('../../services/forwardingService');

describe('forwardingService security (#233)', () => {
  beforeEach(() => {
    redisService.client.data = {};
    jest.restoreAllMocks();
  });

  it('rejects forwarding OTP requests to premium-domain Hide Mail addresses', async () => {
    jest.spyOn(redisService, 'isMailboxActive').mockResolvedValue(true);

    await expect(
      forwardingService.requestOTP('temp@hide-mail.org', 'target@pro-hide-mail.org')
    ).rejects.toThrow('Cannot forward to temporary email addresses');

    await expect(
      forwardingService.requestOTP('temp@hide-mail.org', 'target@VIP.HIDE-MAIL.ORG')
    ).rejects.toThrow('Cannot forward to temporary email addresses');
  });

  it('allows at most the limit into SMTP delivery under concurrent forward requests', async () => {
    const tempMailbox = 'race@hide-mail.org';
    jest.spyOn(otpService, 'getValidatedDestination').mockResolvedValue({
      destinationEmail: 'dest@example.com',
    });
    jest.spyOn(redisService, 'getMailboxMeta').mockResolvedValue(null); // free limit = 2
    jest.spyOn(redisService, 'getEmailById').mockResolvedValue({
      id: 'msg-1',
      from: 'sender@example.org',
      subject: 'Hi',
      text: 'Body',
    });

    let releaseSmtp;
    const smtpGate = new Promise((resolve) => {
      releaseSmtp = resolve;
    });
    const forwardSpy = jest.spyOn(smtpService, 'forwardEmail').mockImplementation(async () => {
      await smtpGate;
      return { messageId: 'smtp-ok' };
    });

    const attempts = Array.from({ length: 5 }, (_, i) =>
      forwardingService.forwardEmail(tempMailbox, `msg-${i}`)
    );

    await Promise.resolve();
    await Promise.resolve();
    releaseSmtp();

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    rejected.forEach((r) => expect(r.reason.code).toBe('RATE_LIMIT_EXCEEDED'));
    expect(forwardSpy).toHaveBeenCalledTimes(2);
  });

  it('rolls back reserved slot on SMTP connection failure, but not on recipient rejection', async () => {
    const tempMailbox = 'rollback@hide-mail.org';
    jest.spyOn(otpService, 'getValidatedDestination').mockResolvedValue({
      destinationEmail: 'dest@example.com',
    });
    jest.spyOn(redisService, 'getMailboxMeta').mockResolvedValue(null);
    jest.spyOn(redisService, 'getEmailById').mockResolvedValue({
      id: 'msg-1',
      from: 'sender@example.org',
      subject: 'Hi',
      text: 'Body',
    });

    const connErr = new Error('connect ECONNREFUSED');
    connErr.code = 'ECONNREFUSED';
    jest.spyOn(smtpService, 'forwardEmail').mockRejectedValueOnce(connErr);
    await expect(forwardingService.forwardEmail(tempMailbox, 'msg-1')).rejects.toMatchObject({
      code: 'SMTP_CONNECTION_FAILED',
    });
    expect((await rateLimiter.checkRateLimit(tempMailbox, 2)).current).toBe(0);

    const err550 = new Error('550 5.1.1 User unknown');
    err550.responseCode = 550;
    jest.spyOn(smtpService, 'forwardEmail').mockRejectedValueOnce(err550);
    await expect(forwardingService.forwardEmail(tempMailbox, 'msg-1')).rejects.toMatchObject({
      code: 'RECIPIENT_REJECTED',
    });
    expect((await rateLimiter.checkRateLimit(tempMailbox, 2)).current).toBe(1);
  });
});
