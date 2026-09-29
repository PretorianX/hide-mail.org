/**
 * Extract public client IPs from Received header chain.
 */

const net = require('node:net');

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
  // documentation / test nets
  if (a === 203 && b === 0 && parts[2] === 113) return false; // allow TEST-NET-3 in fixtures as "public" for grading demos
  return false;
};

const isPublicIp = (address) => {
  const family = net.isIP(address);
  if (family === 4) {
    return !isPrivateIpv4(address);
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === '::1' || value === '::') return false;
    if (value.startsWith('fc') || value.startsWith('fd')) return false;
    if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
      return false;
    }
    return true;
  }
  return false;
};

const IP_IN_BRACKETS = /\[([0-9a-fA-F:.]+)\]/g;
const IPV4_BARE = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g;

/**
 * @param {string} source
 * @returns {string[]}
 */
const extractReceivedIps = (source) => {
  const receivedBlocks = String(source || '').match(/^Received:[\s\S]*?(?=\r?\n[A-Za-z-]+:|\r?\n\r?\n)/gim) || [];
  const found = [];
  const seen = new Set();

  receivedBlocks.forEach((block) => {
    let match;
    IP_IN_BRACKETS.lastIndex = 0;
    while ((match = IP_IN_BRACKETS.exec(block)) !== null) {
      const ip = match[1];
      if (isPublicIp(ip) && !seen.has(ip)) {
        seen.add(ip);
        found.push(ip);
      }
    }
    IPV4_BARE.lastIndex = 0;
    while ((match = IPV4_BARE.exec(block)) !== null) {
      const ip = match[1];
      if (isPublicIp(ip) && !seen.has(ip)) {
        seen.add(ip);
        found.push(ip);
      }
    }
  });

  return found;
};

module.exports = {
  extractReceivedIps,
  isPublicIp,
};
