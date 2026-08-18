const dns = require('node:dns').promises;
const net = require('node:net');

const invalidError = () => new Error('Invalid webhook URL');

const isBlockedHostname = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal');
};

const isPrivateIpv4 = (address) => {
  const parts = address.split('.').map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

const normalizeIpv6 = (address) => address.toLowerCase();

const isPrivateIpv6 = (address) => {
  const value = normalizeIpv6(address);
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true; // unique local
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    return true; // link-local
  }
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) {
      return isPrivateIpv4(mapped);
    }
    // Reject all other ::ffff: forms (e.g., hex-encoded IPv4-mapped addresses)
    return true;
  }
  return false;
};

const isBlockedIp = (address, family) => {
  if (family === 4) {
    return isPrivateIpv4(address);
  }
  if (family === 6) {
    return isPrivateIpv6(address);
  }
  return true;
};

const validatePublicHttpsWebhookUrl = async (url, lookupFn = dns.lookup) => {
  if (!url || typeof url !== 'string') {
    throw invalidError();
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidError();
  }

  if (parsed.protocol !== 'https:') {
    throw invalidError();
  }
  if (parsed.username || parsed.password) {
    throw invalidError();
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw invalidError();
  }

  const resolved = await lookupFn(parsed.hostname, { all: true, verbatim: true });
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw invalidError();
  }

  for (const entry of resolved) {
    if (!entry || !entry.address || !entry.family || isBlockedIp(entry.address, entry.family)) {
      throw invalidError();
    }
  }

  return { ok: true };
};

module.exports = {
  validatePublicHttpsWebhookUrl,
};
