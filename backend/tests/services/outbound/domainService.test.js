process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

jest.mock('../../../services/outbound/domainVerifier');

const { verifyDomain } = require('../../../services/outbound/domainVerifier');
const domainService = require('../../../services/outbound/domainService');
const accountService = require('../../../services/outbound/accountService');
const redisService = require('../../../services/redisService');

const DAY_SECONDS = 24 * 60 * 60;

describe('outbound domainService', () => {
  beforeEach(() => {
    redisService.client.data = {};
    jest.clearAllMocks();
  });

  describe('addDomain', () => {
    it('normalizes the domain, generates a selector/keypair, and returns pending with three expected records', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      const result = await domainService.addDomain({ accountId, domain: 'Example.com.' });

      expect(result.domain).toBe('example.com');
      expect(result.state).toBe('pending');
      expect(result.selector).toMatch(/^hm-[0-9a-f]+$/);
      expect(result.records).toHaveLength(3);
      expect(result.records.map((r) => r.id).sort()).toEqual(['dkim', 'dmarc', 'returnPath']);
    });

    it('persists a meta record with the default daily limit and no suspension', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      await domainService.addDomain({ accountId, domain: 'example.com' });

      const raw = await redisService.client.get('outbound:domain:meta:example.com');
      const meta = JSON.parse(raw);
      expect(meta.accountId).toBe(accountId);
      expect(meta.state).toBe('pending');
      expect(meta.suspended).toBe(false);
      expect(meta.dailyLimit).toBe(1000);
      expect(meta.privateKeyEnc).toMatch(/^gcm:/);
      expect(meta.lastCheckedAt).toBeNull();
    });

    it('adds the domain to the account domains index', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      await domainService.addDomain({ accountId, domain: 'example.com' });

      const domains = await redisService.client.smembers(`outbound:account:${accountId}:domains`);
      expect(domains).toEqual(['example.com']);
    });

    it('rejects a second account adding a domain already claimed by another account', async () => {
      const first = await accountService.createAccount({ label: 'First', days: 30 });
      const second = await accountService.createAccount({ label: 'Second', days: 30 });
      await domainService.addDomain({ accountId: first.accountId, domain: 'example.com' });

      await expect(
        domainService.addDomain({ accountId: second.accountId, domain: 'example.com' })
      ).rejects.toMatchObject({ code: 'DOMAIN_TAKEN' });
    });

    it('is idempotent for the same account re-adding a domain it already owns (no destructive regeneration)', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });
      const first = await domainService.addDomain({ accountId, domain: 'example.com' });

      const second = await domainService.addDomain({ accountId, domain: 'example.com' });

      expect(second).toEqual(first);
    });

    describe('race: two addDomain calls for the same brand-new domain', () => {
      it('claims the domain atomically via SET NX, not a plain read-then-write', async () => {
        const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });
        const setSpy = jest.spyOn(redisService.client, 'set');

        await domainService.addDomain({ accountId, domain: 'race-claim.example.com' });

        const metaKey = 'outbound:domain:meta:race-claim.example.com';
        const claimCall = setSpy.mock.calls.find(([key, , ...flags]) => key === metaKey && flags.includes('NX'));
        expect(claimCall).toBeTruthy();

        setSpy.mockRestore();
      });

      it('safely refuses (DOMAIN_TAKEN) and persists nothing when the atomic claim is forced to fail and no claimant has written anything yet', async () => {
        const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });
        const domain = 'race-empty.example.com';
        const metaKey = `outbound:domain:meta:${domain}`;

        // Forces the NX claim itself to report failure, simulating a
        // concurrent request having won the atomic claim a moment earlier —
        // without that other request actually existing to assert against.
        const setSpy = jest.spyOn(redisService.client, 'set').mockImplementationOnce(async () => null);

        await expect(domainService.addDomain({ accountId, domain })).rejects.toMatchObject({
          code: 'DOMAIN_TAKEN',
        });

        setSpy.mockRestore();
        expect(await redisService.client.get(metaKey)).toBeNull();
      });

      it('throws DOMAIN_TAKEN for a different account when a forced claim failure finds the real winner\'s record, and leaves exactly one meta record', async () => {
        const owner = await accountService.createAccount({ label: 'Owner', days: 30 });
        const other = await accountService.createAccount({ label: 'Other', days: 30 });
        const domain = 'race-other.example.com';
        const metaKey = `outbound:domain:meta:${domain}`;

        const added = await domainService.addDomain({ accountId: owner.accountId, domain });

        const originalSet = redisService.client.set.bind(redisService.client);
        const setSpy = jest.spyOn(redisService.client, 'set');
        setSpy.mockImplementation(async (key, value, ...args) => {
          if (key === metaKey && args.includes('NX')) {
            // Force this claim attempt to lose, as if another request had
            // already won the atomic NX race for this exact domain.
            return null;
          }
          return originalSet(key, value, ...args);
        });

        await expect(
          domainService.addDomain({ accountId: other.accountId, domain })
        ).rejects.toMatchObject({ code: 'DOMAIN_TAKEN' });

        setSpy.mockRestore();

        const raw = await redisService.client.get(metaKey);
        expect(JSON.parse(raw)).toMatchObject({ accountId: owner.accountId, selector: added.selector });
      });

      it('returns the winner\'s own data (idempotent) for the SAME account when a forced claim failure finds its own record', async () => {
        const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });
        const domain = 'race-same.example.com';
        const metaKey = `outbound:domain:meta:${domain}`;

        const added = await domainService.addDomain({ accountId, domain });

        const originalSet = redisService.client.set.bind(redisService.client);
        const setSpy = jest.spyOn(redisService.client, 'set');
        setSpy.mockImplementation(async (key, value, ...args) => {
          if (key === metaKey && args.includes('NX')) {
            return null;
          }
          return originalSet(key, value, ...args);
        });

        const result = await domainService.addDomain({ accountId, domain });

        setSpy.mockRestore();

        expect(result).toEqual(added);
        const raw = await redisService.client.get(metaKey);
        expect(JSON.parse(raw).accountId).toBe(accountId);
      });
    });

    it('writes a gate record whose TTL is within a few seconds of the account licence remaining time', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 10 });
      const expireSpy = jest.spyOn(redisService.client, 'expire');

      await domainService.addDomain({ accountId, domain: 'example.com' });

      const gateCall = expireSpy.mock.calls.find(([key]) => key === 'outbound:domain:gate:example.com');
      expect(gateCall).toBeTruthy();
      expect(gateCall[1]).toBeLessThanOrEqual(10 * DAY_SECONDS);
      expect(gateCall[1]).toBeGreaterThan(10 * DAY_SECONDS - 5);

      expireSpy.mockRestore();
    });

    it('writes a gate record with maySend: false while the domain is pending', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      await domainService.addDomain({ accountId, domain: 'example.com' });

      const raw = await redisService.client.get('outbound:domain:gate:example.com');
      expect(JSON.parse(raw)).toMatchObject({ maySend: false });
    });

    it('deletes any gate record instead of writing maySend: false when the account licence is not active', async () => {
      const { accountId, key } = await accountService.createAccount({ label: 'Acme', days: 30 });
      await require('../../../services/licenseService').revokeLicense(key);

      await domainService.addDomain({ accountId, domain: 'example.com' });

      const raw = await redisService.client.get('outbound:domain:gate:example.com');
      expect(raw).toBeNull();
    });
  });

  describe('checkDomain', () => {
    it('flips pending to verified when DNS now resolves correctly and writes a gate record with maySend: true', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });
      await domainService.addDomain({ accountId, domain: 'example.com' });

      verifyDomain.mockResolvedValue({
        state: 'verified',
        records: [
          { id: 'dkim', status: 'pass', reason: null, nameserverAnswers: [] },
          { id: 'returnPath', status: 'pass', reason: null, nameserverAnswers: [] },
          { id: 'dmarc', status: 'pass', reason: null, nameserverAnswers: [] },
        ],
      });

      const result = await domainService.checkDomain({ accountId, domain: 'example.com' });

      expect(result.state).toBe('verified');
      expect(result.records).toHaveLength(3);

      const metaRaw = await redisService.client.get('outbound:domain:meta:example.com');
      const meta = JSON.parse(metaRaw);
      expect(meta.state).toBe('verified');
      expect(meta.lastCheckedAt).not.toBeNull();

      const gateRaw = await redisService.client.get('outbound:domain:gate:example.com');
      expect(JSON.parse(gateRaw)).toMatchObject({ maySend: true });
    });

    it('calls verifyDomain with the stored selector/publicKeyPem and the current state as previousState', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });
      const added = await domainService.addDomain({ accountId, domain: 'example.com' });
      verifyDomain.mockResolvedValue({ state: 'pending', records: [] });

      await domainService.checkDomain({ accountId, domain: 'example.com' });

      expect(verifyDomain).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'example.com',
          selector: added.selector,
          previousState: 'pending',
        })
      );
    });

    it('rejects with NOT_FOUND for a domain that does not exist', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      await expect(
        domainService.checkDomain({ accountId, domain: 'nope.example.com' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects with NOT_FOUND for a domain owned by a different account', async () => {
      const owner = await accountService.createAccount({ label: 'Owner', days: 30 });
      const other = await accountService.createAccount({ label: 'Other', days: 30 });
      await domainService.addDomain({ accountId: owner.accountId, domain: 'example.com' });

      await expect(
        domainService.checkDomain({ accountId: other.accountId, domain: 'example.com' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('listDomains', () => {
    it('lists only the calling account domains with state/suspended/dailyLimit', async () => {
      const mine = await accountService.createAccount({ label: 'Mine', days: 30 });
      const other = await accountService.createAccount({ label: 'Other', days: 30 });
      await domainService.addDomain({ accountId: mine.accountId, domain: 'a.example.com' });
      await domainService.addDomain({ accountId: mine.accountId, domain: 'b.example.com' });
      await domainService.addDomain({ accountId: other.accountId, domain: 'c.example.com' });

      const domains = await domainService.listDomains({ accountId: mine.accountId });

      expect(domains).toHaveLength(2);
      expect(domains.map((d) => d.domain).sort()).toEqual(['a.example.com', 'b.example.com']);
      expect(domains[0]).toEqual(
        expect.objectContaining({ state: 'pending', suspended: false, dailyLimit: 1000 })
      );
    });

    it('returns an empty array for an account with no domains', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      expect(await domainService.listDomains({ accountId })).toEqual([]);
    });
  });

  describe('removeDomain', () => {
    it('adds the domain to the global index and removes it again', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      await domainService.addDomain({ accountId, domain: 'example.com' });

      expect(await redisService.client.smembers('outbound:domains:index')).toContain('example.com');

      await domainService.removeDomain({ accountId, domain: 'example.com' });

      expect(await redisService.client.smembers('outbound:domains:index')).not.toContain('example.com');
    });

    it('deletes the meta and gate keys and removes the domain from the account index', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });
      await domainService.addDomain({ accountId, domain: 'example.com' });

      const removed = await domainService.removeDomain({ accountId, domain: 'example.com' });

      expect(removed).toBe(true);
      expect(await redisService.client.get('outbound:domain:meta:example.com')).toBeNull();
      expect(await redisService.client.get('outbound:domain:gate:example.com')).toBeNull();
      const domains = await redisService.client.smembers(`outbound:account:${accountId}:domains`);
      expect(domains).not.toContain('example.com');
    });

    it('frees the domain name for a different account to add after removal', async () => {
      const first = await accountService.createAccount({ label: 'First', days: 30 });
      const second = await accountService.createAccount({ label: 'Second', days: 30 });
      await domainService.addDomain({ accountId: first.accountId, domain: 'example.com' });
      await domainService.removeDomain({ accountId: first.accountId, domain: 'example.com' });

      const result = await domainService.addDomain({ accountId: second.accountId, domain: 'example.com' });

      expect(result.state).toBe('pending');
    });

    it('returns false and leaves the domain intact when called by a non-owning account', async () => {
      const owner = await accountService.createAccount({ label: 'Owner', days: 30 });
      const other = await accountService.createAccount({ label: 'Other', days: 30 });
      await domainService.addDomain({ accountId: owner.accountId, domain: 'example.com' });

      const removed = await domainService.removeDomain({ accountId: other.accountId, domain: 'example.com' });

      expect(removed).toBe(false);
      expect(await redisService.client.get('outbound:domain:meta:example.com')).not.toBeNull();
    });

    it('returns false for a domain that does not exist', async () => {
      const { accountId } = await accountService.createAccount({ label: 'Acme', days: 30 });

      expect(await domainService.removeDomain({ accountId, domain: 'nope.example.com' })).toBe(false);
    });
  });
});
