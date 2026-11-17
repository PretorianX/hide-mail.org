const keyCrypto = require('../../../services/outbound/keyCrypto');

const FIXTURE_SECRET = 'test-secret-for-plan-fixture-only';
const FIXTURE_PLAINTEXT = '-----BEGIN PRIVATE KEY-----\nFIXTURE\n-----END PRIVATE KEY-----';
const FIXTURE_ENCODED = 'gcm:0102030405060708090a0b0c:71a349df9ee4f61d8017ec861873f2fd:ff60e41e94256f0f20ce4cd24c8cd05dca84f740da5f8d1dc1af9efc6f4625a39ec770da586e8ee4e15d4839ca015563a4b902f3a50a56f3ed78a97f5a';

test('round-trips an arbitrary plaintext', () => {
  const encoded = keyCrypto.encrypt('hello world', 'some-secret');
  expect(keyCrypto.decrypt(encoded, 'some-secret')).toBe('hello world');
});

test('decrypts the cross-tree fixture', () => {
  expect(keyCrypto.decrypt(FIXTURE_ENCODED, FIXTURE_SECRET)).toBe(FIXTURE_PLAINTEXT);
});

test('rejects a wrong secret with an auth-tag failure', () => {
  const encoded = keyCrypto.encrypt('hello', 'secret-a');
  expect(() => keyCrypto.decrypt(encoded, 'secret-b')).toThrow();
});

test('rejects a malformed encoded string', () => {
  expect(() => keyCrypto.decrypt('not-the-right-format', 'any')).toThrow();
});

test('rejects a truncated auth tag as an invalid format', () => {
  const truncatedTag = FIXTURE_ENCODED.replace(
    '71a349df9ee4f61d8017ec861873f2fd',
    '71a349df9ee4f61d'
  );

  expect(() => keyCrypto.decrypt(truncatedTag, FIXTURE_SECRET)).toThrow(
    'Invalid encrypted value format'
  );
});
