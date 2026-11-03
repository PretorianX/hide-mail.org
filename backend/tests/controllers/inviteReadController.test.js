process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.INVITE_PRICE_MONTHLY_USD = '24';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/inviteRead');
const mailGradeRoutes = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');

const SOURCE = [
  'BEGIN:VCALENDAR',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:design-review@lab.example',
  'DTSTART:20261112T150000Z',
  'DTEND:20261112T153000Z',
  'SUMMARY:Design review',
  'ORGANIZER;CN=Ada Lovelace:mailto:ada@lab.example',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\n');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/invites', browser);
app.use('/invite-read', api);
app.use('/mail-grade', mailGradeRoutes.api);
app.use('/qa', qaApiRoutes);

describe('Invite Read HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the Invite Read API price separately from Pro and Mail Grade', async () => {
    const res = await request(app).get('/invites/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'Invite Read API',
      type: 'invite',
      plan: 'monthly',
      usd: 24,
      checkoutPaused: true,
      endpoint: 'POST /api/invite-read',
    });
  });

  it('reads a pasted meeting request on the free route and does not keep the source', async () => {
    const res = await request(app)
      .post('/invites/report')
      .send({ source: `${SOURCE}\nX-Secret: secret-original-body` })
      .expect(200);

    expect(res.body.report.stamp).toBe('REQUEST');
    expect(res.body.report.summary).toBe('Design review');
    expect(res.body.report.stored).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('secret-original-body');
    expect(JSON.stringify(redisService.client.data)).not.toContain('Design review');
  });

  it('returns a client error when the paste is not a meeting request', async () => {
    const res = await request(app)
      .post('/invites/report')
      .send({ source: 'From: Ada <ada@example.com>\n\nHi' })
      .expect(400);

    expect(res.body.code).toBe('NOT_A_CALENDAR');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/invites/report')
      .send({ source: '  ' })
      .expect(400);

    expect(res.body.code).toBe('EMPTY_INVITE');
  });

  it('returns 413 when the meeting request is larger than 64 KB', async () => {
    const res = await request(app)
      .post('/invites/report')
      .send({ source: `${'x'.repeat((64 * 1024) + 1)}` })
      .expect(413);

    expect(res.body.code).toBe('INVITE_TOO_LARGE');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-invite-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('reads an invite for an Invite Read key and rejects QA and Mail Grade keys', async () => {
      const inviteKey = await issue('invite');
      const qaKey = await issue('api');
      const gradeKey = await issue('grade');

      const read = await request(app)
        .post('/invite-read')
        .set('Authorization', `Bearer ${inviteKey}`)
        .send({ source: SOURCE })
        .expect(200);

      expect(read.body.report.summary).toBe('Design review');

      const qaRejected = await request(app)
        .post('/invite-read')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(qaRejected.body.code).toBe('INVITE_PLAN_REQUIRED');

      const gradeRejected = await request(app)
        .post('/invite-read')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(gradeRejected.body.code).toBe('INVITE_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/invite-read').send({ source: SOURCE }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let an Invite Read key open the QA mailbox API or Mail Grade', async () => {
      const inviteKey = await issue('invite');

      const qa = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${inviteKey}`)
        .send({})
        .expect(403);
      expect(qa.body.code).toBe('QA_PLAN_REQUIRED');

      const grade = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${inviteKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(grade.body.code).toBe('GRADE_PLAN_REQUIRED');
    });
  });
});
