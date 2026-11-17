'use strict';

// ZoneMTA application config for the M0 outbound Send spike.
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

const fs = require('fs');
const path = require('path');
// wild-config parses this file in a vm sandbox that only exposes
// {require, __dirname, __filename, module} - `process` is not a global
// there, so it must be pulled in explicitly via the core module.
const process = require('process');

const DKIM_DOMAIN = 'mail.example.com';
const DKIM_SELECTOR = 'spike';
const DKIM_KEY_PATH = path.join(__dirname, '..', 'testdata', 'dkim.pem');

// Read eagerly so a missing key fails fast at config-load time instead of
// surfacing later as an opaque signing failure deep in the sender process.
const dkimPrivateKey = fs.readFileSync(DKIM_KEY_PATH, 'utf-8');

module.exports = {
    name: 'HideMail Send spike',
    ident: 'hidemail-send-spike',

    dbs: {
        // Queue storage (GridFS + delivery metadata). Service name resolves on
        // the `internal` docker network shared with the root docker-compose.yml.
        mongo: process.env.MONGO_URL || 'mongodb://mongo:27017/zone-mta-spike',
        // zone-mta's OWN locking/counters, separate db index from the
        // hidemail-outbound plugin's own redis client (db 3, set below) to
        // keep key namespaces unambiguous even though prefixes already differ.
        redis: {
            host: process.env.REDIS_HOST || 'redis',
            port: Number(process.env.REDIS_PORT) || 6379,
            db: 2
        }
    },

    queue: {
        instanceId: 'hidemail-send-spike'
    },

    // Plugins are resolved relative to `pluginsPath` unless prefixed with
    // "core/" (always resolved relative to zone-mta's OWN package directory,
    // hardcoded by @zone-eu/wild-plugins) or "modules/" (resolved as an
    // installed npm package name).
    pluginsPath: path.join(__dirname, '..', 'plugins'),

    plugins: {
        // Message-ID / Date headers for anything missing them.
        'core/default-headers': {
            enabled: ['*'],
            addMissing: ['message-id', 'date']
        },

        // Everything below is explicitly disabled for the spike: none of it
        // is needed to prove deliver-vs-hold, and leaving it on would open
        // unnecessary network paths (bounce mail to real MX, auth callouts,
        // antivirus/antispam daemons that are not part of this stack).
        'core/http-auth': { enabled: false },
        'core/api-send': { enabled: false },
        'core/clamav': { enabled: false },
        'core/rspamd': { enabled: false },
        'core/srs': { enabled: false },
        'core/email-bounce': { enabled: false },
        'core/http-bounce': { enabled: false },
        'core/image-hashes': { enabled: false },
        // core/dkim is not used: hidemail-outbound signs via its own
        // sender:connection hook (Task 2), reading the key below.

        // Task 2's plugin: holds/defers per-domain via redis, signs via dkim.
        'hidemail-outbound': {
            enabled: 'sender',
            redis: process.env.PLUGIN_REDIS_URL || 'redis://redis:6379/3',
            dkim: {
                domainName: DKIM_DOMAIN,
                keySelector: DKIM_SELECTOR,
                privateKey: dkimPrivateKey
            }
        }
    },

    smtpInterfaces: {
        feeder: {
            enabled: true,
            port: 2526,
            // Binds to all interfaces INSIDE the container's own network
            // namespace - the loopback-only requirement is enforced one
            // layer out, by docker-compose.spike.yml's host-side publish
            // mapping ("127.0.0.1:2526:2526"). Binding the in-container
            // listener itself to 127.0.0.1 was tried first and found to
            // break Docker Desktop's host<->container port forwarding
            // entirely: its proxy connects to the container via the
            // container's bridge IP, which can't reach a listener bound to
            // that container's own loopback. Nothing about the container's
            // network topology (internal+default bridges, no host network
            // mode) exposes this beyond what the host-side mapping allows.
            host: '0.0.0.0',
            authentication: false,
            // One process keeps spike logs/ordering deterministic; production
            // zone-mta would run several.
            processes: 1
        }
    },

    // No real DNS/MX involved in the spike: the single `default` zone is
    // pointed directly at the integration test's local receiver instead of
    // resolving the recipient's actual MX. See zones.default below.
    dns: {
        caching: false
    },

    // Policy lookups require real DNS for the recipient's domain even when
    // zone.host overrides the connection target; skip it for the spike.
    mtaSts: {
        enabled: false
    },

    api: {
        // Same reasoning as smtpInterfaces.feeder.host above.
        port: 12080,
        host: '0.0.0.0'
    },

    queueServer: {
        // Internal master<->worker data channel only; never published by
        // docker-compose.spike.yml, so loopback-only here is both correct
        // and unaffected by the feeder/api finding above.
        enabled: true,
        port: 12081,
        host: '127.0.0.1'
    },

    log: {
        level: process.env.ZONEMTA_LOG_LEVEL || 'info'
    },

    zones: {
        default: {
            // Smarthost override: every message sent through this zone goes
            // straight to the integration test's local SMTP receiver instead
            // of a real MX. host.docker.internal lets the container reach a
            // port bound on the macOS/Docker Desktop host.
            host: process.env.SPIKE_RECEIVER_HOST || 'host.docker.internal',
            port: Number(process.env.SPIKE_RECEIVER_PORT) || 2599,
            preferIPv6: false,
            ignoreIPv6: true,
            connections: 1,
            processes: 1
        }
    }
};
