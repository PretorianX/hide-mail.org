process.env.VALID_DOMAINS = 'hide-mail.org';

const express = require('express');
const cors = require('cors');
const request = require('supertest');
const { applyBodyParsers, WEBHOOK_PATH } = require('../../middleware/bodyParsers');
const { errorHandler } = require('../../middleware/errorHandler');

const buildTestApp = () => {
  const app = express();
  app.use((req, _res, next) => {
    req.correlationId = 'test-corr-id';
    next();
  });
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origin === 'https://hide-mail.org') {
        return callback(null, true);
      }
      const err = new Error('CORS not allowed');
      err.status = 403;
      err.code = 'ORIGIN_NOT_ALLOWED';
      return callback(err);
    },
  }));
  applyBodyParsers(app);
  app.post('/api/tls/report', (_req, res) => res.json({ success: true }));
  app.post(WEBHOOK_PATH, (_req, res) => res.json({ success: true }));
  app.use(errorHandler);
  return app;
};

describe('errorHandler and consistent error shapes', () => {
  it('returns 403 with unified error shape for disallowed CORS Origin on /api/tls/report', async () => {
    const res = await request(buildTestApp())
      .post('/api/tls/report')
      .set('Origin', 'https://evil.example')
      .send({ domain: 'hide-mail.org' })
      .expect(403);

    expect(res.body).toEqual({
      success: false,
      error: 'CORS not allowed',
      code: 'ORIGIN_NOT_ALLOWED',
      correlationId: 'test-corr-id',
    });
  });

  it('returns 400 with the same error shape for malformed JSON', async () => {
    const res = await request(buildTestApp())
      .post('/api/tls/report')
      .set('Origin', 'https://hide-mail.org')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(res.body).toEqual({
      success: false,
      error: 'Malformed JSON body',
      code: 'INVALID_JSON',
      correlationId: 'test-corr-id',
    });
  });

  it('returns 400 with the same error shape for non-JSON webhook body', async () => {
    const res = await request(buildTestApp())
      .post(WEBHOOK_PATH)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('not-json')
      .expect(400);

    expect(res.body).toEqual({
      success: false,
      error: 'JSON body required',
      code: 'INVALID_JSON',
    });
  });
});
