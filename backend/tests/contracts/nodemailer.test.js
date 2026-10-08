/**
 * Forward & Forget sends with require('nodemailer').createTransport() and reads
 * result.messageId. nodemailer 10 is ESM ("type": "module"); this sends a real
 * message into smtp-server, the same library the inbound listener uses.
 */

const { SMTPServer } = require('smtp-server');
const nodemailer = require('nodemailer');

describe('nodemailer send contract', () => {
  let server;
  let port;
  let received;

  beforeAll((done) => {
    received = '';
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['AUTH', 'STARTTLS'],
      logger: false,
      onData(stream, _session, callback) {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          received = Buffer.concat(chunks).toString('utf8');
          callback();
        });
      },
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('delivers a message and returns a message id', async () => {
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port,
      secure: false,
      ignoreTLS: true,
    });

    const result = await transport.sendMail({
      from: 'noreply@hide-mail.org',
      to: 'ada@example.com',
      subject: 'Forward check',
      text: 'Your code is 123456',
    });

    expect(typeof result.messageId).toBe('string');
    expect(result.messageId.length).toBeGreaterThan(0);
    expect(received).toContain('Subject: Forward check');
    expect(received).toContain('Your code is 123456');
    expect(received).toContain('ada@example.com');
  });
});
