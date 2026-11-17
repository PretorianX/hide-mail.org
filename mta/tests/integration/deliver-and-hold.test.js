'use strict';

// Integration test for Task 3 of the M0 ZoneMTA spike.
//
// Proves, against the REAL zone-mta binary + the hidemail-outbound plugin
// (Task 2) running in docker-compose.spike.yml - not mocks - that:
//   1. a domain the redis gate allows ("1") gets its mail delivered, signed
//      with a cryptographically valid DKIM-Signature;
//   2. a domain the gate does not allow gets no delivery attempt at all
//      (nothing reaches the receiver within a short window).
//
// Requires the spike stack to be running and ZONEMTA_SPIKE=1:
//
//   docker compose -f docker-compose.yml -f mta/docker-compose.spike.yml \
//     --profile spike up -d --build redis mongo zonemta
//   ZONEMTA_SPIKE=1 npm test --prefix mta -- tests/integration/deliver-and-hold.test.js
//
// Without ZONEMTA_SPIKE=1 this whole suite is skipped (not silently passed).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Redis = require('ioredis');
const { SMTPServer } = require('smtp-server');
const { dkimVerify } = require('mailauth/lib/dkim/verify');

const RUN = process.env.ZONEMTA_SPIKE === '1';

const FEEDER_HOST = '127.0.0.1';
const FEEDER_PORT = 2526;
const REDIS_URL = 'redis://127.0.0.1:6379/3';
const RECEIVER_HOST = '127.0.0.1';
const RECEIVER_PORT = 2599; // must match config/zonemta.js zones.default.port
const API_BASE_URL = 'http://127.0.0.1:12080'; // must match config/zonemta.js api.port
const ZONE = 'default'; // must match config/zonemta.js zones.default

const DKIM_SELECTOR = 'spike';
const DKIM_DOMAIN = 'mail.example.com';
const DKIM_KEY_PATH = path.join(__dirname, '..', '..', 'testdata', 'dkim.pem');

const ALLOWED_DOMAIN = 'allowed.example.net';
const BLOCKED_DOMAIN = 'blocked.example.net';
const REDIS_KEY_PREFIX = 'outbound:spike:domain:';

const DELIVER_TIMEOUT_MS = 20000;
const HOLD_WAIT_MS = 6000;

function requireDkimKey() {
    if (!fs.existsSync(DKIM_KEY_PATH)) {
        throw new Error(`DKIM key not found at ${DKIM_KEY_PATH}. Run: node mta/scripts/generate-spike-dkim.js`);
    }
    return fs.readFileSync(DKIM_KEY_PATH, 'utf-8');
}

// Builds a resolver matching the `(name, rrtype) => Promise<string[][]>`
// shape mailauth's getPublicKey expects (same shape as dns.promises.resolve),
// serving the spike's own public key instead of doing a real DNS lookup for
// mail.example.com, which does not exist.
function makeDkimResolver(publicKeyBase64) {
    return async (name, rrtype) => {
        if (rrtype === 'TXT' && name === `${DKIM_SELECTOR}._domainkey.${DKIM_DOMAIN}`) {
            return [[`v=DKIM1; k=rsa; p=${publicKeyBase64}`]];
        }
        const err = new Error(`no TXT record for ${name}`);
        err.code = 'ENOTFOUND';
        throw err;
    };
}

function waitFor(predicate, { timeoutMs, intervalMs = 150 }) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            const value = predicate();
            if (value) {
                return resolve(value);
            }
            if (Date.now() - start > timeoutMs) {
                return reject(new Error(`Timed out after ${timeoutMs}ms waiting for condition`));
            }
            setTimeout(check, intervalMs);
        };
        check();
    });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Queries ZoneMTA's own (loopback-bound, unauthenticated-by-config) HTTP API
// for the zone's deferred queue. Response shape per
// node_modules/zone-mta/lib/api-server.js's `GET /queued/:type/:zone` route
// (backed by lib/mail-queue.js#listQueued): { zone, type, list: [...] },
// where each list entry is { id, zone, recipient, created, queued, deferred }.
// `queued` is an ISO timestamp set to the *next retry time* (now + backoff),
// and the route only includes documents whose `queued` is still in the
// future (that is literally what "deferred" means to this endpoint, as
// opposed to "queued" = due now, or gone entirely = rejected/bounced).
// `deferred` is the running `_deferred.count` - how many times
// lib/sender.js#deferDelivery has rescheduled this exact message - which is
// only incremented via the real defer path, not on a permanent reject path.
async function fetchDeferredQueue(zone) {
    const response = await fetch(`${API_BASE_URL}/queued/deferred/${zone}`);
    const body = await response.json();
    return { status: response.status, body };
}

const describeOrSkip = RUN ? describe : describe.skip;

if (!RUN) {
    // Visible in test output even when the suite body below is skipped, so a
    // plain `npm test` run never silently omits why this file did nothing.
    test.skip('ZONEMTA_SPIKE=1 not set - skipping ZoneMTA deliver/hold integration test against the real spike stack', () => {});
}

describeOrSkip('ZoneMTA spike: deliver vs hold (requires docker-compose.spike.yml up)', () => {
    let receivedMessages;
    let receiver;
    let redis;
    let transport;
    let dkimResolver;

    beforeAll(async () => {
        const privateKeyPem = requireDkimKey();
        const publicKeyDer = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' });
        dkimResolver = makeDkimResolver(publicKeyDer.toString('base64'));

        receivedMessages = [];
        receiver = new SMTPServer({
            secure: false,
            authOptional: true,
            disabledCommands: ['AUTH', 'STARTTLS'],
            logger: false,
            onData(stream, session, callback) {
                const chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                stream.on('end', () => {
                    receivedMessages.push({
                        envelope: session.envelope,
                        raw: Buffer.concat(chunks)
                    });
                    callback();
                });
            }
        });
        await new Promise((resolve, reject) => {
            receiver.on('error', reject);
            receiver.listen(RECEIVER_PORT, RECEIVER_HOST, resolve);
        });

        // Fail fast (instead of ioredis's default indefinite reconnect-retry)
        // so that running this suite against a stack that isn't up yet
        // surfaces a clear connection error quickly rather than hanging.
        redis = new Redis(REDIS_URL, {
            connectTimeout: 3000,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null
        });
        redis.on('error', () => {}); // surfaced via the awaited command instead

        transport = nodemailer.createTransport({
            host: FEEDER_HOST,
            port: FEEDER_PORT,
            secure: false,
            tls: { rejectUnauthorized: false },
            connectionTimeout: 10000
        });
    }, 15000);

    afterAll(async () => {
        if (transport) {
            transport.close();
        }
        if (redis) {
            try {
                await redis.quit();
            } catch (err) {
                redis.disconnect();
            }
        }
        if (receiver) {
            await new Promise(resolve => receiver.close(resolve));
        }
    });

    beforeEach(() => {
        receivedMessages.length = 0;
    });

    test(
        'delivers signed mail when the domain may send',
        async () => {
            await redis.set(REDIS_KEY_PREFIX + ALLOWED_DOMAIN, '1');

            await transport.sendMail({
                from: `alice@${ALLOWED_DOMAIN}`,
                to: 'bob@anywhere.example.org',
                subject: 'M0 spike: deliver case',
                text: 'This message should be delivered and DKIM-signed.'
            });

            const message = await waitFor(() => receivedMessages[0], { timeoutMs: DELIVER_TIMEOUT_MS });

            expect(message.envelope.mailFrom.address).toBe(`alice@${ALLOWED_DOMAIN}`);

            const raw = message.raw.toString('utf-8');
            expect(raw).toMatch(/^DKIM-Signature:/im);
            const [, dkimHeaderLine] = raw.match(/^(DKIM-Signature:[^]*?)\r?\n\S/m) || [];
            // eslint-disable-next-line no-console
            console.log('[deliver-and-hold] received DKIM-Signature header:\n' + (dkimHeaderLine || '(not found)'));

            const verification = await dkimVerify(message.raw, { resolver: dkimResolver });
            expect(verification.results.length).toBeGreaterThan(0);
            const [signature] = verification.results;
            // eslint-disable-next-line no-console
            console.log('[deliver-and-hold] dkim verification status:', JSON.stringify(signature.status));
            expect(signature.status.header.i).toBe(`@${DKIM_DOMAIN}`);
            expect(signature.status.header.s).toBe(DKIM_SELECTOR);
            expect(signature.status.result).toBe('pass');
        },
        DELIVER_TIMEOUT_MS + 5000
    );

    test(
        'defers without any delivery attempt when the domain is held',
        async () => {
            await redis.del(REDIS_KEY_PREFIX + BLOCKED_DOMAIN);

            const heldRecipient = 'dave@anywhere.example.org';
            await transport.sendMail({
                from: `carol@${BLOCKED_DOMAIN}`,
                to: heldRecipient,
                subject: 'M0 spike: hold case',
                text: 'This message must NOT reach the receiver.'
            });

            await wait(HOLD_WAIT_MS);

            // eslint-disable-next-line no-console
            console.log(`[deliver-and-hold] receiver message count after ${HOLD_WAIT_MS}ms wait: ${receivedMessages.length}`);
            // Corroborating check only: by itself this cannot distinguish
            // "deferred" from "permanently rejected/dropped" - both look
            // like zero deliveries at the receiver. The positive proof is
            // the API assertion below.
            expect(receivedMessages).toHaveLength(0);

            // Positive proof of "deferred", not just "not yet delivered": ask
            // ZoneMTA's own queue API. A regression to a permanent reject
            // (the exact bug this spike exists to rule out) would make this
            // message vanish from the deferred list - possibly bounced,
            // possibly silently dropped - instead of sitting here with a
            // future retry time and an incremented defer counter.
            let status;
            let body;
            let deferredEntry;
            const apiDeadline = Date.now() + 5000;
            do {
                ({ status, body } = await fetchDeferredQueue(ZONE));
                deferredEntry = (body.list || []).find(entry => entry.recipient === heldRecipient);
                if (deferredEntry) {
                    break;
                }
                await wait(200);
            } while (Date.now() < apiDeadline);

            // eslint-disable-next-line no-console
            console.log(`[deliver-and-hold] GET ${API_BASE_URL}/queued/deferred/${ZONE} -> ${status}`, JSON.stringify(body));

            expect(status).toBe(200);
            expect(body.zone).toBe(ZONE);
            expect(body.type).toBe('deferred');
            expect(deferredEntry).toBeDefined();

            // `queued` on a "deferred"-typed entry is the next retry time,
            // and the API only lists entries here while that time is still
            // in the future - this is the field that actually distinguishes
            // retry-eligible from permanently gone.
            expect(new Date(deferredEntry.queued).getTime()).toBeGreaterThan(Date.now());

            // `deferred` (from Mongo's `_deferred.count`) is only
            // incremented by the real defer path (lib/sender.js
            // deferDelivery) - never by the reject/bounce path - so >= 1
            // proves this message actually went through a defer, not that
            // it is merely sitting untouched in the initial "queued" state.
            expect(deferredEntry.deferred).toBeGreaterThanOrEqual(1);
        },
        HOLD_WAIT_MS + 5000
    );
});
