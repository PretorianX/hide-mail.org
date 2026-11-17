const crypto = require('node:crypto');

jest.mock('../../../services/outbound/dnsAuthoritative');

const {
  findAuthoritativeNameservers,
  queryAuthoritative,
} = require('../../../services/outbound/dnsAuthoritative');
const { verifyDomain } = require('../../../services/outbound/domainVerifier');

const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const DKIM_P = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

const DOMAIN = 'x.com';
const SELECTOR = 's';
const DKIM_HOST = `${SELECTOR}._domainkey.${DOMAIN}`;
const RETURN_PATH_HOST = `hm-bounce.${DOMAIN}`;
const SPF_HOST = DOMAIN;
const DMARC_HOST = `_dmarc.${DOMAIN}`;

const answered = (records) => ({
  answered: [{ nameserver: 'ns1.example.com', records, error: null }],
});

// Default "everything passes" responder, keyed by queried host.
const passingResponder = ({ name }) => {
  if (name === DKIM_HOST) return Promise.resolve(answered([`v=DKIM1; k=rsa; p=${DKIM_P}`]));
  if (name === RETURN_PATH_HOST) return Promise.resolve(answered(['rp.hide-mail.org']));
  if (name === SPF_HOST) {
    return Promise.resolve(answered(['v=spf1 include:_spf.hide-mail.org ~all']));
  }
  if (name === DMARC_HOST) return Promise.resolve(answered(['v=DMARC1; p=none']));
  throw new Error(`unexpected host queried: ${name}`);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
  process.env.OUTBOUND_SPF_INCLUDE = '_spf.hide-mail.org';
  findAuthoritativeNameservers.mockResolvedValue(['ns1.example.com']);
});

describe('verifyDomain', () => {
  test('verified when every record passes', async () => {
    queryAuthoritative.mockImplementation(passingResponder);

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.state).toBe('verified');
    expect(result.records).toHaveLength(4);
    expect(result.records.every((r) => r.status === 'pass')).toBe(true);
    expect(result.records.every((r) => r.reason === null)).toBe(true);
  });

  test('SPF passes when an existing record includes _spf.hide-mail.org among other mechanisms', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === SPF_HOST) {
        return Promise.resolve(
          answered(['v=spf1 include:_spf.google.com include:_spf.hide-mail.org -all'])
        );
      }
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.state).toBe('verified');
    expect(result.records.find((r) => r.id === 'spf')).toMatchObject({
      status: 'pass',
      reason: null,
    });
  });

  test('SPF fails when apex TXT has v=spf1 without the Hide Mail include', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === SPF_HOST) {
        return Promise.resolve(answered(['v=spf1 include:_spf.google.com ~all']));
      }
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.state).toBe('pending');
    expect(result.records.find((r) => r.id === 'spf')).toMatchObject({
      status: 'fail',
      reason: 'mismatch',
    });
  });

  test('a verified domain whose DKIM record now answers wrong becomes broken, not pending', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === DKIM_HOST) return Promise.resolve(answered(['v=DKIM1; k=rsa; p=WRONGKEYDATA']));
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'verified',
    });

    expect(result.state).toBe('broken');
    expect(result.records.find((r) => r.id === 'dkim')).toMatchObject({
      status: 'fail',
      reason: 'mismatch',
    });
    expect(result.records.find((r) => r.id === 'returnPath').status).toBe('pass');
    expect(result.records.find((r) => r.id === 'dmarc').status).toBe('pass');
  });

  test('no nameserver answering for a verified domain keeps it verified with reason no_answer (Review Focus)', async () => {
    queryAuthoritative.mockResolvedValue({ answered: [] });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'verified',
    });

    expect(result.state).toBe('verified');
    expect(result.records).toHaveLength(4);
    result.records.forEach((record) => {
      expect(record.reason).toBe('no_answer');
      expect(record.nameserverAnswers).toEqual([]);
    });
    expect(queryAuthoritative).toHaveBeenCalledTimes(4);
    expect(findAuthoritativeNameservers).toHaveBeenCalledTimes(4);
  });

  test('a brand-new domain with no records yet is pending, not broken', async () => {
    queryAuthoritative.mockResolvedValue(answered([]));

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.state).toBe('pending');
    expect(result.records.every((r) => r.status === 'fail')).toBe(true);
    expect(result.records.every((r) => r.reason === 'missing')).toBe(true);
  });

  test('a previously pending domain with no answers at all stays pending (no_answer never implies verified)', async () => {
    queryAuthoritative.mockResolvedValue({ answered: [] });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.state).toBe('pending');
    expect(result.records.every((r) => r.reason === 'no_answer')).toBe(true);
  });

  test('multiple TXT records at the DKIM host fail with reason multiple_records', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === DKIM_HOST) {
        return Promise.resolve(answered([`v=DKIM1; k=rsa; p=${DKIM_P}`, 'v=DKIM1; k=rsa; p=OTHERKEY']));
      }
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.records.find((r) => r.id === 'dkim')).toMatchObject({
      status: 'fail',
      reason: 'multiple_records',
    });
  });

  test('an unrelated TXT record next to the real DKIM record does not falsely trigger multiple_records', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === DKIM_HOST) {
        return Promise.resolve(answered(['v=spf1 -all', `v=DKIM1; k=rsa; p=${DKIM_P}`]));
      }
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    const dkim = result.records.find((r) => r.id === 'dkim');
    expect(dkim.reason).not.toBe('multiple_records');
    expect(dkim.status).toBe('pass');
  });

  test('a CNAME found where a TXT record was expected fails with reason cname_where_txt_expected', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === DMARC_HOST) return Promise.resolve(answered(['some-vendor-target.example.net']));
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.records.find((r) => r.id === 'dmarc')).toMatchObject({
      status: 'fail',
      reason: 'cname_where_txt_expected',
    });
  });

  test('passes only when every answered nameserver agrees, not just one of several', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === RETURN_PATH_HOST) {
        return Promise.resolve({
          answered: [
            { nameserver: 'ns1.example.com', records: ['rp.hide-mail.org'], error: null },
            { nameserver: 'ns2.example.com', records: ['stale-target.example.com'], error: null },
          ],
        });
      }
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    const returnPath = result.records.find((r) => r.id === 'returnPath');
    expect(returnPath.status).toBe('fail');
    expect(returnPath.reason).toBe('mismatch');
    expect(returnPath.nameserverAnswers).toEqual([
      { nameserver: 'ns1.example.com', value: ['rp.hide-mail.org'], matched: true },
      { nameserver: 'ns2.example.com', value: ['stale-target.example.com'], matched: false },
    ]);
  });

  test('DKIM comparison ignores whitespace introduced by TXT string-splitting', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === DKIM_HOST) return Promise.resolve(answered([`v=DKIM1; k=rsa; p= ${DKIM_P.slice(0, 50)} ${DKIM_P.slice(50)}`]));
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.records.find((r) => r.id === 'dkim').status).toBe('pass');
  });

  test('a DMARC record with no usable policy fails as a mismatch', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === DMARC_HOST) return Promise.resolve(answered(['v=DMARC1; rua=mailto:x@x.com']));
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'pending',
    });

    expect(result.records.find((r) => r.id === 'dmarc')).toMatchObject({
      status: 'fail',
      reason: 'mismatch',
    });
  });

  test('a broken domain with no nameserver answering at all stays broken, not pending', async () => {
    queryAuthoritative.mockResolvedValue({ answered: [] });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'broken',
    });

    expect(result.state).toBe('broken');
    expect(result.records.every((r) => r.reason === 'no_answer')).toBe(true);
  });

  test('a broken domain with a persistent real fail (DKIM mismatch) stays broken, not pending', async () => {
    queryAuthoritative.mockImplementation(({ name }) => {
      if (name === DKIM_HOST) return Promise.resolve(answered(['v=DKIM1; k=rsa; p=WRONGKEYDATA']));
      return passingResponder({ name });
    });

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'broken',
    });

    expect(result.state).toBe('broken');
    expect(result.records.find((r) => r.id === 'dkim')).toMatchObject({
      status: 'fail',
      reason: 'mismatch',
    });
  });

  test('a broken domain becomes verified again once every record passes', async () => {
    queryAuthoritative.mockImplementation(passingResponder);

    const result = await verifyDomain({
      domain: DOMAIN,
      selector: SELECTOR,
      publicKeyPem: PEM,
      previousState: 'broken',
    });

    expect(result.state).toBe('verified');
    expect(result.records.every((r) => r.status === 'pass')).toBe(true);
  });
});
