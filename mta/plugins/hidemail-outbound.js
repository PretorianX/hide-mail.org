'use strict';

const Redis = require('ioredis');
const { decrypt } = require('../lib/keyCrypto');

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0';
const GATE_PREFIX = 'outbound:domain:gate:';
const EVENTS_STREAM = 'outbound:events';
const CACHE_TTL_MS = 5000;
// Simple insertion-order eviction (not full LRU) — sufficient at this scale.
const MAX_CACHE_ENTRIES = 5000;

const BOUNCE_ENVELOPE_RE = /^b-([^@]+)@hm-bounce\.(.+)$/i;

const parseBounceEnvelopeFrom = from => {
    if (!from || typeof from !== 'string') {
        return null;
    }
    const match = from.match(BOUNCE_ENVELOPE_RE);
    if (!match) {
        return null;
    }
    return { messageId: match[1], domain: match[2].toLowerCase() };
};

const ACTION_TO_TYPE = {
    ACCEPTED: 'delivered',
    DEFERRED: 'deferred',
    REJECTED: 'bounced'
};

module.exports.title = 'HideMail outbound gate';
module.exports.parseBounceEnvelopeFrom = parseBounceEnvelopeFrom;
module.exports.MAX_CACHE_ENTRIES = MAX_CACHE_ENTRIES;

module.exports.init = (app, done) => {
    const redis = new Redis(app.config.redis || process.env.REDIS_URL || DEFAULT_REDIS_URL);
    // domain -> { gate, expires }
    const cache = new Map();

    const cacheSet = (domain, gate) => {
        if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(domain)) {
            const oldest = cache.keys().next().value;
            cache.delete(oldest);
        }
        cache.set(domain, { gate, expires: Date.now() + CACHE_TTL_MS });
    };

    const loadGate = async domain => {
        if (!domain) {
            return null;
        }
        const hit = cache.get(domain);
        if (hit && hit.expires > Date.now()) {
            return hit.gate;
        }
        const raw = await redis.get(GATE_PREFIX + domain);
        let gate = null;
        if (raw) {
            try {
                gate = JSON.parse(raw);
            } catch (_err) {
                gate = null;
            }
        }
        cacheSet(domain, gate);
        return gate;
    };

    app.addHook('sender:fetch', async delivery => {
        const parsed = parseBounceEnvelopeFrom(delivery.envelope.from || '');
        const domain = parsed && parsed.domain;
        const gate = await loadGate(domain);
        if (gate && gate.maySend === true) {
            return;
        }
        const err = new Error('Domain held');
        err.name = 'SMTPResponse';
        err.responseCode = 451;
        err.action = 'defer';
        throw err;
    });

    app.addHook('sender:connection', (delivery, options, next) => {
        const run = async () => {
            const parsed = parseBounceEnvelopeFrom(delivery.envelope.from || '');
            const domain = parsed && parsed.domain;
            if (!domain) {
                return;
            }
            const gate = await loadGate(domain);
            if (!gate || !gate.privateKeyEnc || !gate.selector) {
                return;
            }
            const secret = process.env.OUTBOUND_KEY_ENCRYPTION_SECRET;
            const privateKey = decrypt(gate.privateKeyEnc, secret);
            delivery.dkim = delivery.dkim || {};
            delivery.dkim.keys = (delivery.dkim.keys || []).concat({
                domainName: domain,
                keySelector: gate.selector,
                privateKey
            });
        };

        Promise.resolve(run())
            .then(() => next())
            .catch(err => next(err));
    });

    app.addHook('log:entry', (entry, doneCb) => {
        const finish = () => {
            try {
                doneCb();
            } catch (_err) {
                // never throw from observer
            }
        };

        const type = ACTION_TO_TYPE[entry && entry.action];
        if (!type) {
            finish();
            return;
        }

        const parsed = parseBounceEnvelopeFrom(entry.returnPath || entry.from || '');
        if (!parsed) {
            if (app.logger && typeof app.logger.info === 'function') {
                app.logger.info('hidemail-outbound: skipping log:entry with unparseable envelope');
            }
            finish();
            return;
        }

        const at = new Date().toISOString();
        Promise.resolve(
            redis.xadd(
                EVENTS_STREAM,
                '*',
                'type',
                type,
                'messageId',
                parsed.messageId,
                'domain',
                parsed.domain,
                'response',
                entry.response || '',
                'at',
                at
            )
        )
            .catch(err => {
                if (app.logger && typeof app.logger.error === 'function') {
                    app.logger.error('hidemail-outbound: failed to XADD outbound:events', err);
                }
            })
            .then(finish, finish);
    });

    // Test-only introspection for the cache-bound test.
    module.exports._cacheSizeForTests = () => cache.size;

    done();
};
