process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';

const redisService = require('../../services/redisService');
const attachmentController = require('../../controllers/attachmentController');

const MAILBOX = 'shopper@hide-mail.org';
const PDF_BYTES = 'invoice-pdf-bytes';

const downloadRes = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  set(headers) {
    Object.assign(this.headers, headers);
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
});

const storeMessageWithInvoice = async () => {
  await redisService.registerMailbox(MAILBOX, 1800);
  await redisService.storeEmail(MAILBOX, {
    id: 'msg-1',
    from: 'billing@shop.test',
    subject: 'Your invoice',
    text: 'Invoice attached',
    receivedAt: new Date().toISOString(),
    attachments: [
      {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
        cid: null,
        content: Buffer.from(PDF_BYTES).toString('base64'),
        encoding: 'base64',
      },
    ],
  });
};

const download = async (params) => {
  const res = downloadRes();
  await attachmentController.downloadAttachment({ params }, res, (err) => { throw err; });
  return res;
};

describe('attachmentController.downloadAttachment', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org']);
  });

  it('returns the decoded attachment bytes', async () => {
    await storeMessageWithInvoice();

    const res = await download({ email: MAILBOX, id: 'msg-1', index: '0' });

    expect(res.statusCode).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString()).toBe(PDF_BYTES);
  });

  it('sends headers that make the browser save the file instead of rendering it', async () => {
    await storeMessageWithInvoice();

    const res = await download({ email: MAILBOX, id: 'msg-1', index: '0' });

    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Length']).toBe(String(Buffer.byteLength(PDF_BYTES)));
    expect(res.headers['Content-Disposition']).toContain('attachment; filename="invoice.pdf"');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('rejects a malformed mailbox address', async () => {
    const res = await download({ email: 'not-an-address', id: 'msg-1', index: '0' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDRESS');
  });

  it('returns 404 when the message does not exist', async () => {
    await redisService.registerMailbox(MAILBOX, 1800);

    const res = await download({ email: MAILBOX, id: 'missing', index: '0' });

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('returns 404 when the index points past the attachment list', async () => {
    await storeMessageWithInvoice();

    const res = await download({ email: MAILBOX, id: 'msg-1', index: '7' });

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('returns 404 for a message that carries no attachments', async () => {
    await redisService.registerMailbox(MAILBOX, 1800);
    await redisService.storeEmail(MAILBOX, {
      id: 'msg-2',
      from: 'hello@shop.test',
      subject: 'No files here',
      receivedAt: new Date().toISOString(),
    });

    const res = await download({ email: MAILBOX, id: 'msg-2', index: '0' });

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('ATTACHMENT_NOT_FOUND');
  });
});
