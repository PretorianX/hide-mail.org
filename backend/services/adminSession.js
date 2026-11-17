/**
 * Signed admin session cookies (HMAC-SHA256). No Redis session store.
 */

const crypto = require('crypto');
const config = require('../config/config');

const COOKIE_NAME = 'hm_admin_session';

const timingSafeEqualString = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
};

const isConfigured = () =>
  Boolean(config.admin.email && config.admin.password && config.admin.sessionSecret);

const credentialsMatch = (email, password) => {
  if (!isConfigured()) {
    return false;
  }
  return (
    timingSafeEqualString(email.trim().toLowerCase(), config.admin.email.trim().toLowerCase()) &&
    timingSafeEqualString(password, config.admin.password)
  );
};

const signPayload = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', config.admin.sessionSecret)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
};

const verifyToken = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const [body, sig] = token.split('.');
  if (!body || !sig) {
    return null;
  }
  const expected = crypto
    .createHmac('sha256', config.admin.sessionSecret)
    .update(body)
    .digest('base64url');
  if (!timingSafeEqualString(sig, expected)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.exp <= Date.now()) {
    return null;
  }
  return payload;
};

const createSessionToken = (email) => {
  const now = Date.now();
  return signPayload({
    sub: email.trim().toLowerCase(),
    iat: now,
    exp: now + config.admin.sessionTtlSeconds * 1000,
  });
};

const parseCookies = (header) => {
  const out = {};
  if (!header || typeof header !== 'string') {
    return out;
  }
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
};

const readSessionFromRequest = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  return verifyToken(cookies[COOKIE_NAME]);
};

const setSessionCookie = (res, token) => {
  const maxAge = config.admin.sessionTtlSeconds;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (config.environment === 'production') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearSessionCookie = (res) => {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (config.environment === 'production') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
};

module.exports = {
  COOKIE_NAME,
  isConfigured,
  credentialsMatch,
  createSessionToken,
  verifyToken,
  readSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
};
