'use strict';

const Redis = require('ioredis');

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/3';
const KEY_PREFIX = 'outbound:spike:domain:';
// Short enough that flipping a domain to "1" releases held mail within seconds,
// long enough that a busy sender does not hit Redis for every queued recipient.
const CACHE_TTL_MS = 5000;

module.exports.title = 'HideMail outbound gate';

module.exports.init = (app, done) => {
    const redis = new Redis(app.config.redis || process.env.REDIS_URL || DEFAULT_REDIS_URL);
    const cache = new Map(); // domain -> { maySend, expires }

    const domainOf = from => from.substr(from.lastIndexOf('@') + 1).toLowerCase();

    const maySend = async domain => {
        const hit = cache.get(domain);
        if (hit && hit.expires > Date.now()) {
            return hit.maySend;
        }
        const mayNow = (await redis.get(KEY_PREFIX + domain)) === '1';
        cache.set(domain, { maySend: mayNow, expires: Date.now() + CACHE_TTL_MS });
        return mayNow;
    };

    app.addHook('sender:fetch', async delivery => {
        const domain = domainOf(delivery.envelope.from || '');
        if (await maySend(domain)) {
            return;
        }
        const err = new Error('Domain held');
        err.name = 'SMTPResponse';
        err.responseCode = 451;
        // ZoneMTA classifies unknown text as a permanent reject; an explicit action is
        // the only thing that makes this a defer (lib/sender.js handleResponseError).
        err.action = 'defer';
        throw err;
    });

    app.addHook('sender:connection', (delivery, options, next) => {
        const dkim = app.config.dkim;
        if (dkim) {
            delivery.dkim.keys = (delivery.dkim.keys || []).concat({
                domainName: dkim.domainName,
                keySelector: dkim.keySelector,
                privateKey: dkim.privateKey
            });
        }
        next();
    });

    done();
};
