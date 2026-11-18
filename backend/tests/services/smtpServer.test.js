process.env.VALID_DOMAINS = 'hide-mail.org';

const net = require('net');
const { createSmtpServer } = require('../../services/smtpServer');

const createMockDeps = () => ({
  redisService: {
    isDomainValid: jest.fn().mockResolvedValue(true),
  },
  inboundMailService: {
    deliverInboundMessage: jest.fn().mockResolvedValue({ delivered: true }),
  },
  resolveKnownRecipient: jest.fn().mockResolvedValue({ mailbox: 'user@hide-mail.org', label: null }),
  shouldAcceptOutboundBounceRcpt: jest.fn().mockReturnValue(false),
  metrics: {
    smtpConnectionsTotal: { inc: jest.fn() },
    smtpRecipientsAcceptedTotal: { inc: jest.fn() },
    smtpRecipientsRejectedTotal: { inc: jest.fn() },
    smtpErrorsTotal: { inc: jest.fn() },
    emailsReceivedTotal: { inc: jest.fn() },
    emailSizeBytes: { observe: jest.fn() },
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  smtpLogger: false,
});

const startServer = (opts = {}) =>
  new Promise((resolve, reject) => {
    const deps = createMockDeps();
    const server = createSmtpServer({ ...deps, ...opts });
    server.listen(0, '127.0.0.1', () => {
      const address = server.server.address();
      resolve({ server, port: address.port, deps });
    });
    server.on('error', reject);
  });

const stopServer = (server) =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

const smtpExchange = (port, commands) =>
  new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const responses = [];
    let buffer = '';
    let idx = 0;

    const sendNext = () => {
      if (idx < commands.length) {
        socket.write(`${commands[idx++]}\r\n`);
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        responses.push(line);
        // Multi-line SMTP responses have '-' at index 3; final line has ' '
        if (/^\d{3} /.test(line)) {
          sendNext();
        }
      }
    });

    socket.on('end', () => resolve(responses));
    socket.on('close', () => resolve(responses));
    socket.on('error', reject);
  });

describe('smtpServer security limits (#224)', () => {
  it('advertises SIZE in EHLO and rejects MAIL FROM with SIZE exceeding limit', async () => {
    const { server, port } = await startServer({
      smtpInbound: { maxMessageBytes: 1024 },
    });

    try {
      const responses = await smtpExchange(port, [
        'EHLO test.example',
        'MAIL FROM:<sender@example.com> SIZE=2048',
        'QUIT',
      ]);

      expect(responses.some((line) => /^250[ -]SIZE 1024$/.test(line))).toBe(true);
      expect(responses.some((line) => line.startsWith('552 '))).toBe(true);
    } finally {
      await stopServer(server);
    }
  });

  it('rejects oversize DATA stream mid-transfer with 552 and does not deliver', async () => {
    const { server, port, deps } = await startServer({
      smtpInbound: { maxMessageBytes: 256 },
    });

    try {
      const oversizeBody = 'A'.repeat(1024);
      const responses = await smtpExchange(port, [
        'EHLO test.example',
        'MAIL FROM:<sender@example.com>',
        'RCPT TO:<user@hide-mail.org>',
        'DATA',
        `Subject: Big\r\n\r\n${oversizeBody}\r\n.`,
        'QUIT',
      ]);

      expect(responses.some((line) => line.startsWith('552 '))).toBe(true);
      expect(deps.inboundMailService.deliverInboundMessage).not.toHaveBeenCalled();
    } finally {
      await stopServer(server);
    }
  });

  it('disconnects slow-loris / idle connections after socketTimeoutMs', async () => {
    const { server, port } = await startServer({
      smtpInbound: { socketTimeoutMs: 150 },
    });

    try {
      const closed = await new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        let gotGreeting = false;
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error('Expected server to close idle socket'));
        }, 2000);

        socket.on('data', (chunk) => {
          if (!gotGreeting && chunk.toString('utf8').startsWith('220 ')) {
            gotGreeting = true;
            // Send incomplete command and stall
            socket.write('EHLO slow');
          }
        });

        socket.on('close', () => {
          clearTimeout(timer);
          resolve(true);
        });
        socket.on('error', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });

      expect(closed).toBe(true);
    } finally {
      await stopServer(server);
    }
  });

  it('enforces maxRecipients per envelope with 452', async () => {
    const { server, port } = await startServer({
      smtpInbound: { maxRecipients: 2 },
    });

    try {
      const responses = await smtpExchange(port, [
        'EHLO test.example',
        'MAIL FROM:<sender@example.com>',
        'RCPT TO:<a@hide-mail.org>',
        'RCPT TO:<b@hide-mail.org>',
        'RCPT TO:<c@hide-mail.org>',
        'QUIT',
      ]);

      // 1x MAIL FROM + 2x RCPT TO = 3x '250 Accepted', 3rd RCPT TO rejected with 452
      expect(responses.filter((l) => l === '250 Accepted')).toHaveLength(3);
      expect(responses.some((l) => l.startsWith('452 '))).toBe(true);
    } finally {
      await stopServer(server);
    }
  });

  it('enforces per-IP concurrent connection limit with 421', async () => {
    const { server, port } = await startServer({
      smtpInbound: { maxConnectionsPerIp: 1, socketTimeoutMs: 2000 },
    });

    let firstSocket;
    try {
      firstSocket = await new Promise((resolve, reject) => {
        const s = net.connect(port, '127.0.0.1');
        s.once('data', () => resolve(s));
        s.once('error', reject);
      });

      const secondResponses = await smtpExchange(port, ['QUIT']);
      expect(secondResponses.some((l) => l.startsWith('421 '))).toBe(true);
    } finally {
      if (firstSocket) firstSocket.destroy();
      await stopServer(server);
    }
  });
});
