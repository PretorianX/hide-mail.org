const crypto = require('node:crypto');

const { buildExpectedRecords } = require('../../../services/outbound/domainRecords');

describe('buildExpectedRecords', () => {
  const originalTarget = process.env.OUTBOUND_RETURN_PATH_TARGET;

  afterEach(() => {
    process.env.OUTBOUND_RETURN_PATH_TARGET = originalTarget;
  });

  test('builds the three required records with the DKIM public key derived from the PEM', () => {
    process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const records = buildExpectedRecords({
      domain: 'mail.example.com',
      selector: 'hm1',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    });

    expect(records.find((r) => r.id === 'dkim')).toMatchObject({
      type: 'TXT',
      host: 'hm1._domainkey.mail.example.com',
    });
    expect(records.find((r) => r.id === 'dkim').expected).toMatch(/^v=DKIM1; k=rsa; p=/);
    expect(records.find((r) => r.id === 'returnPath')).toEqual({
      id: 'returnPath',
      type: 'CNAME',
      host: 'hm-bounce.mail.example.com',
      expected: 'rp.hide-mail.org',
    });
    expect(records.find((r) => r.id === 'dmarc')).toMatchObject({
      id: 'dmarc',
      type: 'TXT',
      host: '_dmarc.mail.example.com',
      expected: null,
    });
  });

  test('derives the exact base64 SPKI DER encoding of the public key PEM', () => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    const expectedP = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

    const records = buildExpectedRecords({ domain: 'x.com', selector: 's', publicKeyPem: pem });

    expect(records.find((r) => r.id === 'dkim').expected).toBe(`v=DKIM1; k=rsa; p=${expectedP}`);
  });

  test('returns exactly three records with the three expected ids', () => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const records = buildExpectedRecords({
      domain: 'x.com',
      selector: 's',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    });

    expect(records).toHaveLength(3);
    expect(records.map((r) => r.id).sort()).toEqual(['dkim', 'dmarc', 'returnPath']);
  });
});
