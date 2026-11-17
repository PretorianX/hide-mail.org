'use strict';

const mockGet = jest.fn();
const mockRedisCtor = jest.fn();

jest.mock('ioredis', () =>
    jest.fn().mockImplementation((...args) => {
        mockRedisCtor(...args);
        return { get: mockGet };
    })
);

const plugin = require('../../plugins/hidemail-outbound');

const DKIM_CONFIG = {
    domainName: 'mail.example.com',
    keySelector: 'hm1',
    privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'
};

function setup(config = {}) {
    const hooks = {};
    const app = {
        config,
        addHook: (name, handler) => {
            hooks[name] = handler;
        }
    };
    const done = jest.fn();
    plugin.init(app, done);
    return { hooks, done };
}

// Mirrors @zone-eu/wild-plugins runHooksAsync: a hook may call next(err) or return a promise.
// Resolves with the error the hook produced, or undefined when it let the message through.
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

function runFetch(hooks, from = 'a@mail.example.com') {
    const delivery = { envelope: { from, to: 'b@dest.example.org' } };
    return runHook(hooks['sender:fetch'], [delivery]);
}

beforeEach(() => {
    mockGet.mockReset();
    mockRedisCtor.mockReset();
});

afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.REDIS_URL;
});

describe('hidemail-outbound plugin', () => {
    test('exports title and registers both hooks', () => {
        const { hooks, done } = setup();

        expect(typeof plugin.title).toBe('string');
        expect(typeof hooks['sender:fetch']).toBe('function');
        expect(typeof hooks['sender:connection']).toBe('function');
        expect(done).toHaveBeenCalledTimes(1);
    });

    test('holds when redis key missing', async () => {
        mockGet.mockResolvedValue(null);
        const { hooks } = setup();

        const err = await runFetch(hooks);

        expect(mockGet).toHaveBeenCalledWith('outbound:spike:domain:mail.example.com');
        expect(err).toBeInstanceOf(Error);
        expect(err.responseCode).toBe(451);
        expect(err.message).toBe('Domain held');
        expect(err.action).toBe('defer');
    });

    test('holds when redis key is 0', async () => {
        mockGet.mockResolvedValue('0');
        const { hooks } = setup();

        const err = await runFetch(hooks);

        expect(err.responseCode).toBe(451);
        expect(err.message).toBe('Domain held');
        expect(err.action).toBe('defer');
    });

    test('allows when redis key is 1', async () => {
        mockGet.mockResolvedValue('1');
        const { hooks } = setup();

        const err = await runFetch(hooks);

        expect(err).toBeUndefined();
    });

    test('attaches dkim key from config on sender:connection', async () => {
        const { hooks } = setup({ dkim: DKIM_CONFIG });
        const delivery = { envelope: { from: 'a@mail.example.com' }, dkim: {} };

        await runHook(hooks['sender:connection'], [delivery, {}]);

        expect(delivery.dkim.keys).toEqual([
            {
                domainName: 'mail.example.com',
                keySelector: 'hm1',
                privateKey: DKIM_CONFIG.privateKey
            }
        ]);
    });

    test('leaves dkim untouched when app.config.dkim is absent', async () => {
        const { hooks } = setup();
        const delivery = { envelope: { from: 'a@mail.example.com' }, dkim: {} };

        await runHook(hooks['sender:connection'], [delivery, {}]);

        expect(delivery.dkim.keys).toBeUndefined();
    });

    test('caches the redis lookup per domain for a short TTL', async () => {
        mockGet.mockResolvedValue('1');
        let now = 1000000;
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        const { hooks } = setup();

        await runFetch(hooks);
        await runFetch(hooks);
        expect(mockGet).toHaveBeenCalledTimes(1);

        now += 10000; // past TTL
        await runFetch(hooks);
        expect(mockGet).toHaveBeenCalledTimes(2);
    });

    test('uses app.config.redis, then REDIS_URL, then the default URL', () => {
        setup({ redis: 'redis://cfg:6379/1' });
        expect(mockRedisCtor).toHaveBeenLastCalledWith('redis://cfg:6379/1');

        process.env.REDIS_URL = 'redis://env:6379/2';
        setup();
        expect(mockRedisCtor).toHaveBeenLastCalledWith('redis://env:6379/2');

        delete process.env.REDIS_URL;
        setup();
        expect(mockRedisCtor).toHaveBeenLastCalledWith('redis://127.0.0.1:6379/3');
    });
});
