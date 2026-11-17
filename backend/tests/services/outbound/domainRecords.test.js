const crypto = require('node:crypto');

const { buildExpectedRecords } = require('../../../services/outbound/domainRecords');

describe('buildExpectedRecords', () => {
  const originalTarget = process.env.OUTBOUND_RETURN_PATH_TARGET;
  const originalSpf = process.env.OUTBOUND_SPF_INCLUDE;

  afterEach(() => {
    process.env.OUTBOUND_RETURN_PATH_TARGET = originalTarget;
    process.env.OUTBOUND_SPF_INCLUDE = originalSpf;
  });

  test('builds the four required records with the DKIM public key derived from the PEM', () => {
    process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
    process.env.OUTBOUND_SPF_INCLUDE = '_spf.hide-mail.org';
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
      purpose: 'Bounce / Return-Path',
      type: 'CNAME',
      host: 'hm-bounce.mail.example.com',
      expected: 'rp.hide-mail.org',
    });
    expect(records.find((r) => r.id === 'spf')).toMatchObject({
      id: 'spf',
      purpose: 'SPF (authorize Hide Mail)',
      type: 'TXT',
      host: 'mail.example.com',
      expected: 'v=spf1 include:_spf.hide-mail.org ~all',
      includeHost: '_spf.hide-mail.org',
    });
    expect(records.find((r) => r.id === 'dmarc')).toMatchObject({
      id: 'dmarc',
      purpose: 'DMARC policy',
      type: 'TXT',
      host: '_dmarc.mail.example.com',
      expected: 'v=DMARC1; p=none;',
    });
  });

  test('derives the exact base64 SPKI DER encoding of the public key PEM', () => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    const expectedP = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

    const records = buildExpectedRecords({ domain: 'x.com', selector: 's', publicKeyPem: pem });

    expect(records.find((r) => r.id === 'dkim').expected).toBe(`v=DKIM1; k=rsa; p=${expectedP}`);
  });

  test('returns exactly four records with the four expected ids', () => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const records = buildExpectedRecords({
      domain: 'x.com',
      selector: 's',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    });

    expect(records).toHaveLength(4);
    expect(records.map((r) => r.id).sort()).toEqual(['dkim', 'dmarc', 'returnPath', 'spf']);
  });
});
