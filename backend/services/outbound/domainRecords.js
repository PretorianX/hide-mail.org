const crypto = require('node:crypto');

const derivePublicKeyBase64 = (publicKeyPem) => (
  crypto.createPublicKey(publicKeyPem)
    .export({ type: 'spki', format: 'der' })
    .toString('base64')
);

// Spec 5.3's table: the three DNS records a sending domain must publish and
// the exact value expected at each. Consumed by domainVerifier.verifyDomain.
const buildExpectedRecords = ({ domain, selector, publicKeyPem }) => ([
  {
    id: 'dkim',
    type: 'TXT',
    host: `${selector}._domainkey.${domain}`,
    expected: `v=DKIM1; k=rsa; p=${derivePublicKeyBase64(publicKeyPem)}`,
  },
  {
    id: 'returnPath',
    type: 'CNAME',
    host: `hm-bounce.${domain}`,
    expected: process.env.OUTBOUND_RETURN_PATH_TARGET,
  },
  {
    id: 'dmarc',
    type: 'TXT',
    host: `_dmarc.${domain}`,
    // DMARC has no single expected value: any syntactically valid v=DMARC1
    // record (p=none accepted) passes. See domainVerifier's DMARC check.
    expected: null,
  },
]);

module.exports = {
  buildExpectedRecords,
};
