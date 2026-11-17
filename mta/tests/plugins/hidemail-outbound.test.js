'use strict';

const mockGet = jest.fn();
const mockXadd = jest.fn();
const mockRedisCtor = jest.fn();

jest.mock('ioredis', () =>
    jest.fn().mockImplementation((...args) => {
        mockRedisCtor(...args);
        return { get: mockGet, xadd: mockXadd };
    })
);

process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const keyCrypto = require('../../lib/keyCrypto');
const plugin = require('../../plugins/hidemail-outbound');

const TEST_PEM = '-----BEGIN PRIVATE KEY-----\ntest-pem\n-----END PRIVATE KEY-----';

function setup(config = {}) {
    const hooks = {};
    const app = {
        config,
        logger: { info: jest.fn(), error: jest.fn() },
        addHook: (name, handler) => {
            hooks[name] = handler;
        }
    };
    const done = jest.fn();
    plugin.init(app, done);
    return { hooks, done, app };
}

function runHook(handler, args) {
    return new Promise(resolve => {
        const result = handler(...args, err => resolve(err || undefined));
        if (result instanceof Promise) {
            result.then(
                () => resolve(undefined),
                err => resolve(err)
            );
        }
    });
}

function runFetch(hooks, from = 'b-m1@hm-bounce.mail.example.com') {
    const delivery = { envelope: { from, to: 'b@dest.example.org' } };
    return runHook(hooks['sender:fetch'], [delivery]);
}

function flushMicrotasks() {
    return new Promise(resolve => setImmediate(resolve));
}

beforeEach(() => {
    mockGet.mockReset();
    mockXadd.mockReset().mockResolvedValue('1-0');
    mockRedisCtor.mockReset();
    delete process.env.REDIS_URL;
});

afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.REDIS_URL;
});

describe('hidemail-outbound plugin', () => {
    test('parses messageId and domain from a well-formed bounce envelope', () => {
        expect(plugin.parseBounceEnvelopeFrom('b-abc123@hm-bounce.mail.example.com')).toEqual({
            messageId: 'abc123',
            domain: 'mail.example.com'
        });
    });

    test('returns null for an envelope that is not ours', () => {
        expect(plugin.parseBounceEnvelopeFrom('someone@elsewhere.com')).toBeNull();
    });

    test('exports title and registers fetch, connection, and log:entry hooks', () => {
        const { hooks, done } = setup();
        expect(typeof plugin.title).toBe('string');
        expect(typeof hooks['sender:fetch']).toBe('function');
        expect(typeof hooks['sender:connection']).toBe('function');
        expect(typeof hooks['log:entry']).toBe('function');
        expect(done).toHaveBeenCalledTimes(1);
    });

    test('holds when the gate record is missing', async () => {
        mockGet.mockResolvedValue(null);
        const { hooks } = setup();

        const err = await runFetch(hooks);

        expect(mockGet).toHaveBeenCalledWith('outbound:domain:gate:mail.example.com');
        expect(err).toBeInstanceOf(Error);
        expect(err.responseCode).toBe(451);
        expect(err.message).toBe('Domain held');
        expect(err.action).toBe('defer');
    });

    test('holds when the gate record has maySend: false', async () => {
        mockGet.mockResolvedValue(
            JSON.stringify({ maySend: false, selector: 's', privateKeyEnc: 'gcm:...' })
        );
        const { hooks } = setup();

        const err = await runFetch(hooks);
        expect(err.responseCode).toBe(451);
        expect(err.action).toBe('defer');
    });

    test('allows and attaches the decrypted per-domain key on sender:connection', async () => {
        const encoded = keyCrypto.encrypt(TEST_PEM, process.env.OUTBOUND_KEY_ENCRYPTION_SECRET);
        mockGet.mockResolvedValue(
            JSON.stringify({ maySend: true, selector: 'hm1', privateKeyEnc: encoded })
        );
        const { hooks } = setup();
        await runFetch(hooks, 'b-m1@hm-bounce.mail.example.com');
        const delivery = { envelope: { from: 'b-m1@hm-bounce.mail.example.com' }, dkim: {} };
        await runHook(hooks['sender:connection'], [delivery, {}]);
        expect(delivery.dkim.keys).toEqual([
            { domainName: 'mail.example.com', keySelector: 'hm1', privateKey: TEST_PEM }
        ]);
    });

    test('log:entry ACCEPTED writes a delivered event to the outbound:events stream', async () => {
        const { hooks } = setup();
        const done = jest.fn();
        hooks['log:entry'](
            { action: 'ACCEPTED', returnPath: 'b-m1@hm-bounce.mail.example.com', response: '250 OK' },
            done
        );
        await flushMicrotasks();
        expect(mockXadd).toHaveBeenCalledWith(
            'outbound:events',
            '*',
            'type',
            'delivered',
            'messageId',
            'm1',
            'domain',
            'mail.example.com',
            'response',
            '250 OK',
            'at',
            expect.any(String)
        );
        expect(done).toHaveBeenCalled();
    });

    test('log:entry ignores QUEUED/DROP/NOQUEUE actions', async () => {
        const { hooks } = setup();
        for (const action of ['QUEUED', 'DROP', 'NOQUEUE']) {
            mockXadd.mockClear();
            const done = jest.fn();
            hooks['log:entry']({ action, returnPath: 'b-m1@hm-bounce.mail.example.com' }, done);
            await flushMicrotasks();
            expect(mockXadd).not.toHaveBeenCalled();
            expect(done).toHaveBeenCalled();
        }
    });

    test('log:entry on an unparseable envelope logs and does not throw', async () => {
        const { hooks, app } = setup();
        const done = jest.fn();
        expect(() => {
            hooks['log:entry']({ action: 'ACCEPTED', returnPath: 'not-ours@example.com' }, done);
        }).not.toThrow();
        await flushMicrotasks();
        expect(mockXadd).not.toHaveBeenCalled();
        expect(done).toHaveBeenCalled();
        expect(app.logger.info).toHaveBeenCalled();
    });

    test('bounds the per-domain cache to MAX_CACHE_ENTRIES', async () => {
        mockGet.mockImplementation(async key =>
            JSON.stringify({ maySend: true, selector: 'hm1', privateKeyEnc: 'gcm:x' })
        );
        const { hooks } = setup();
        const limit = plugin.MAX_CACHE_ENTRIES;
        for (let i = 0; i < limit + 10; i += 1) {
            await runFetch(hooks, `b-id@hm-bounce.d${i}.example.com`);
        }
        expect(plugin._cacheSizeForTests()).toBeLessThanOrEqual(limit);
    });

    test('uses app.config.redis, then REDIS_URL, then the default product URL', () => {
        setup({ redis: 'redis://cfg:6379/1' });
        expect(mockRedisCtor).toHaveBeenLastCalledWith('redis://cfg:6379/1');

        process.env.REDIS_URL = 'redis://env:6379/2';
        setup();
        expect(mockRedisCtor).toHaveBeenLastCalledWith('redis://env:6379/2');

        delete process.env.REDIS_URL;
        setup();
        expect(mockRedisCtor).toHaveBeenLastCalledWith('redis://127.0.0.1:6379/0');
    });
});
