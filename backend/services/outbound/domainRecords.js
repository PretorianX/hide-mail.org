const crypto = require('node:crypto');

/** Suggested starter DMARC when the customer has none. Verifier still accepts any valid v=DMARC1. */
const SUGGESTED_DMARC_RECORD = 'v=DMARC1; p=none;';

const spfIncludeHost = () =>
  String(process.env.OUTBOUND_SPF_INCLUDE || '_spf.hide-mail.org').trim().toLowerCase();

/** Suggested apex SPF for new domains. Verifier requires include:<host>, not an exact string match. */
const suggestedSpfRecord = () => `v=spf1 include:${spfIncludeHost()} ~all`;

const derivePublicKeyBase64 = (publicKeyPem) => (
  crypto.createPublicKey(publicKeyPem)
    .export({ type: 'spki', format: 'der' })
    .toString('base64')
);

// DNS records a sending domain must publish. Consumed by domainVerifier.verifyDomain.
const buildExpectedRecords = ({ domain, selector, publicKeyPem }) => {
  const includeHost = spfIncludeHost();
  return [
    {
      id: 'dkim',
      purpose: 'DKIM signing',
      type: 'TXT',
      host: `${selector}._domainkey.${domain}`,
      expected: `v=DKIM1; k=rsa; p=${derivePublicKeyBase64(publicKeyPem)}`,
    },
    {
      id: 'returnPath',
      purpose: 'Bounce / Return-Path',
      type: 'CNAME',
      host: `hm-bounce.${domain}`,
      // Points at Hide Mail's return-path host (rp = return-path) so DSNs reach us.
      expected: process.env.OUTBOUND_RETURN_PATH_TARGET,
    },
    {
      id: 'spf',
      purpose: 'SPF (authorize Hide Mail)',
      type: 'TXT',
      host: domain,
      // Suggestion for domains with no SPF yet. Verifier accepts any v=spf1 that
      // includes this host (customers may already have other mechanisms).
      expected: suggestedSpfRecord(),
      includeHost,
    },
    {
      id: 'dmarc',
      purpose: 'DMARC policy',
      type: 'TXT',
      host: `_dmarc.${domain}`,
      // Suggestion for new domains. Verifier accepts any syntactically valid v=DMARC1
      // (including an existing customer policy); it does not require this exact string.
      expected: SUGGESTED_DMARC_RECORD,
    },
  ];
};

module.exports = {
  SUGGESTED_DMARC_RECORD,
  spfIncludeHost,
  suggestedSpfRecord,
  buildExpectedRecords,
};
