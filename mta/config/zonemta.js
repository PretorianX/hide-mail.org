'use strict';

// ZoneMTA application config for Hide Mail outbound Send (production-shaped).
//
// This file is loaded on top of zone-mta's own bundled config/default.js via
// `node node_modules/zone-mta/app.js --config=<this file>` (see mta/Dockerfile).
// Only keys listed here override the defaults; anything not mentioned keeps
// zone-mta's stock behaviour (see node_modules/zone-mta/config/default.js).
//
// IMPORTANT path quirk (wild-config): this file is parsed in a vm sandbox with
// `require` bound to wild-config's own module, so only Node core modules may
// be required here. `__dirname`/`__filename` are rebased to this file's own
// location, so relative-path core module calls (fs, path) are safe.

const path = require('path');
// wild-config parses this file in a vm sandbox that only exposes
// {require, __dirname, __filename, module} - `process` is not a global
// there, so it must be pulled in explicitly via the core module.
const process = require('process');

const HELO_HOSTNAME = process.env.OUTBOUND_HELO_HOSTNAME || 'mail.hide-mail.org';

module.exports = {
    name: 'HideMail Send',
    ident: 'hidemail-send',

    dbs: {
        mongo: process.env.MONGO_URL || 'mongodb://mongo:27017/zone-mta',
        // zone-mta's OWN locking/counters (separate from the plugin Redis client).
        redis: {
            host: process.env.REDIS_HOST || 'redis',
            port: Number(process.env.REDIS_PORT) || 6379,
            db: 2
        }
    },

    queue: {
        instanceId: 'hidemail-send'
    },

    pluginsPath: path.join(__dirname, '..', 'plugins'),

    plugins: {
        'core/default-headers': {
            enabled: ['*'],
            addMissing: ['message-id', 'date']
        },

        'core/http-auth': { enabled: false },
        'core/api-send': { enabled: false },
        'core/clamav': { enabled: false },
        'core/rspamd': { enabled: false },
        'core/srs': { enabled: false },
        'core/email-bounce': { enabled: false },
        'core/http-bounce': { enabled: false },
        'core/image-hashes': { enabled: false },

        // Gate + per-domain DKIM + delivery event stream. Keys come from
        // outbound:domain:gate:<domain> (AES-GCM), not a fixed config PEM.
        'hidemail-outbound': {
            enabled: 'sender',
            // Product Redis db 0 — matches backend REDIS_URL (no /N suffix ⇒ db 0).
            redis: process.env.PLUGIN_REDIS_URL || 'redis://127.0.0.1:6379/0'
        }
    },

    smtpInterfaces: {
        feeder: {
            enabled: true,
            port: 2526,
            host: '0.0.0.0',
            authentication: false,
            processes: 1
        }
    },

    dns: {
        caching: true
    },

    mtaSts: {
        enabled: false
    },

    api: {
        port: 12080,
        host: '0.0.0.0'
    },

    queueServer: {
        enabled: true,
        port: 12081,
        host: '127.0.0.1'
    },

    log: {
        level: process.env.ZONEMTA_LOG_LEVEL || 'info'
    },

    // EHLO/HELO hostname: zone-mta reads pool entry `name` (see
    // node_modules/zone-mta/config/default.js pools.default comment and
    // lib/sender.js delivery.zoneAddress.name → connection options.name).
    pools: {
        default: [
            {
                address: '0.0.0.0',
                name: HELO_HOSTNAME
            }
        ]
    },

    // Production: no smarthost — ZoneMTA resolves recipient MX and delivers.
    // Local spike testing still uses mta/docker-compose.spike.yml overrides.
    zones: {
        default: {
            preferIPv6: false,
            ignoreIPv6: true,
            connections: 1,
            processes: 1,
            pool: 'default'
        }
    }
};
