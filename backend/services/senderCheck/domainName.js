/**
 * Accept a public domain name and nothing else. URLs and addresses are rejected
 * rather than rewritten into a domain.
 */

const { domainToASCII } = require('node:url');
const { SenderCheckError } = require('./errors');

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const normalizeDomain = (input) => {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) {
    throw new SenderCheckError('DOMAIN_EMPTY', 'Enter a domain name.');
  }
  if (raw.includes('@')) {
    throw new SenderCheckError('DOMAIN_INVALID', 'Enter the domain only, not an email address.');
  }
  if (raw.includes('://') || raw.includes('/') || raw.includes(':') || /\s/.test(raw)) {
    throw new SenderCheckError('DOMAIN_INVALID', 'Enter a domain name, like example.com.');
  }

  const absolute = raw.endsWith('.') ? raw.slice(0, -1) : raw;
  if (!absolute || absolute.endsWith('.')) {
    throw new SenderCheckError('DOMAIN_INVALID', 'Enter a domain name, like example.com.');
  }

  const ascii = domainToASCII(absolute);
  if (!ascii || !HOSTNAME.test(ascii)) {
    throw new SenderCheckError('DOMAIN_INVALID', 'Enter a domain name, like example.com.');
  }
  return ascii;
};

module.exports = {
  normalizeDomain,
};
