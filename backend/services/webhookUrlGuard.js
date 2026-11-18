const dns = require('node:dns').promises;
const net = require('node:net');

const invalidError = () => new Error('Invalid webhook URL');

const isBlockedHostname = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  );
};

const parseIpv4 = (address) => {
  if (typeof address !== 'string') return null;
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return octets;
};

const isPrivateIpv4 = (address) => {
  const octets = parseIpv4(address);
  if (!octets) return true;
  const [a, b, c] = octets;

  if (a === 0) return true; // 0.0.0.0/8 ("this" network)
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT RFC6598)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF protocol)
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 (6to4 relay)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true; // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved/broadcast)
  return false;
};

const parseIpv6Words = (address) => {
  if (typeof address !== 'string') return null;
  const clean = address.split('%')[0].toLowerCase();
  if (!clean) return null;

  const halves = clean.split('::');
  if (halves.length > 2) return null;

  const parseSide = (side) => {
    if (!side) return [];
    const tokens = side.split(':');
    const words = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.includes('.')) {
        // Embedded IPv4 only valid at the very end
        if (i !== tokens.length - 1) return null;
        const v4 = parseIpv4(tok);
        if (!v4) return null;
        words.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(tok)) {
        words.push(parseInt(tok, 16));
      } else {
        return null;
      }
    }
    return words;
  };

  const left = parseSide(halves[0]);
  if (!left) return null;

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const right = parseSide(halves[1]);
  if (!right) return null;

  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;

  return [...left, ...new Array(missing).fill(0), ...right];
};

const isPrivateIpv6 = (address) => {
  const words = parseIpv6Words(address);
  if (!words) return true;

  // ::/128 (unspecified) and ::1/128 (loopback)
  const firstSevenZero = words.slice(0, 7).every((w) => w === 0);
  if (firstSevenZero && (words[7] === 0 || words[7] === 1)) {
    return true;
  }

  // ::ffff:0:0/96 (IPv4-mapped IPv6)
  const isV4Mapped =
    words[0] === 0 &&
    words[1] === 0 &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0xffff;
  if (isV4Mapped) {
    const v4 = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
    return isPrivateIpv4(v4);
  }

  // 64:ff9b::/96 & 64:ff9b:1::/48 (NAT64)
  if (words[0] === 0x0064 && words[1] === 0xff9b) {
    if (words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0) return true;
    if (words[2] === 0x0001) return true;
  }

  // 0100::/64 (discard-only)
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return true;

  // 2001::/32 (Teredo) & 2001:db8::/32 (documentation)
  if (words[0] === 0x2001 && (words[1] === 0x0000 || words[1] === 0x0db8)) return true;

  // 2002::/16 (6to4)
  if (words[0] === 0x2002) return true;

  // fc00::/7 (Unique local addresses)
  if ((words[0] & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (Link-local)
  if ((words[0] & 0xffc0) === 0xfe80) return true;

  // fec0::/10 (Deprecated site-local)
  if ((words[0] & 0xffc0) === 0xfec0) return true;

  // ff00::/8 (Multicast)
  if ((words[0] & 0xff00) === 0xff00) return true;

  return false;
};

const isBlockedIp = (address, family) => {
  const detectedFamily = family || net.isIP(address);
  if (detectedFamily === 4) {
    return isPrivateIpv4(address);
  }
  if (detectedFamily === 6) {
    return isPrivateIpv6(address);
  }
  return true;
};

const resolveAndValidateHost = async (hostname, lookupFn = dns.lookup) => {
  if (isBlockedHostname(hostname)) {
    throw invalidError();
  }

  // If hostname is already an IP literal, validate it directly without DNS
  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    if (isBlockedIp(hostname, literalFamily)) {
      throw invalidError();
    }
    return [{ address: hostname, family: literalFamily }];
  }

  const resolved = await lookupFn(hostname, { all: true, verbatim: true });
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw invalidError();
  }

  for (const entry of resolved) {
    if (!entry || !entry.address || !entry.family || isBlockedIp(entry.address, entry.family)) {
      throw invalidError();
    }
  }

  return resolved;
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

  await resolveAndValidateHost(parsed.hostname, lookupFn);

  return { ok: true };
};

/**
 * Create a Node `net.connect` / `https.request` compatible `lookup` callback that
 * resolves, validates all returned IPs against non-global ranges, and pins the
 * validated IP for the socket connection (preventing DNS rebinding).
 */
const createPinnedLookup = (lookupFn = dns.lookup) => (hostname, options, callback) => {
  let opts = options;
  let cb = callback;
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  resolveAndValidateHost(hostname, lookupFn)
    .then((resolved) => {
      if (opts && opts.all) {
        return cb(null, resolved);
      }
      const chosen = resolved[0];
      return cb(null, chosen.address, chosen.family);
    })
    .catch((err) => cb(err));
};

module.exports = {
  isBlockedIp,
  resolveAndValidateHost,
  validatePublicHttpsWebhookUrl,
  createPinnedLookup,
};
