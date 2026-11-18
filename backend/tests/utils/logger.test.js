const winston = require('winston');
const { Writable } = require('stream');

describe('backend logger email redaction and rotation', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  test('redacts email addresses in log messages and metadata', () => {
    const lines = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString('utf8'));
        cb();
      },
    });

    const logger = require('../../utils/logger');
    const streamTransport = new winston.transports.Stream({ stream: sink });
    logger.add(streamTransport);

    try {
      logger.info('Delivered message to alice.smith@example.com from bob+tag@corp.org', {
        recipient: 'victim@private.org',
        nested: { list: ['one@test.io', 'plain-value'] },
      });
    } finally {
      logger.remove(streamTransport);
    }

    const output = lines.join('\n');
    expect(output).not.toContain('alice.smith@example.com');
    expect(output).not.toContain('bob+tag@corp.org');
    expect(output).not.toContain('victim@private.org');
    expect(output).not.toContain('one@test.io');
    expect(output).toContain('[redacted-email]');
    expect(output).toContain('plain-value');
  });

  test('configures bounded file rotation in production', () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const logger = require('../../utils/logger');
    const fileTransports = logger.transports.filter(
      (t) => t instanceof winston.transports.File
    );
    expect(fileTransports.length).toBe(2);
    for (const t of fileTransports) {
      expect(t.maxsize).toBeGreaterThan(0);
      expect(t.maxFiles).toBeGreaterThan(0);
    }
  });
});
