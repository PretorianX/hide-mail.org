# Outbound Send M1 — Sending Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the sending core of Hide Mail Send: operator-issued `outbound` accounts, DNS-verified sending domains, a send API with caps and suppression, a real ZoneMTA plugin signing with per-domain keys, an idempotent event consumer, and an operator host script — with no portal, no metrics endpoint, and no bounce mail-back.

**Architecture:** New `backend/services/outbound/` modules own account, domain, send-key, cap, rate-limit, message, suppression and event-consumer logic; thin routes/controllers under `backend/routes/outbound/` and `backend/controllers/outbound/` expose them. `mta/plugins/hidemail-outbound.js` grows from the M0 spike's two hooks to five, reading one JSON "gate" record per domain from product Redis and appending delivery outcomes to the `outbound:events` Redis stream. `docker-compose.yml` gains permanent (non-spike) `zonemta` and `mongo` services. All new backend state lives in Redis; nothing survives only in process memory.

**Tech Stack:** Node 24+ (backend, host tooling), Node 22 (mta/ Docker runtime — unchanged ceiling from M0), Express 5, ioredis, nodemailer 10, zone-mta 3.10.3, Redis Streams, Jest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-17-outbound-send-design.md` (sections 3, 5.2–5.7, 5.10, 5.11, 6 milestone 1, 8, 10)

**Also read:**
- `docs/superpowers/specs/2026-11-17-outbound-send-m0-spike-report.md` — Node 22 ceiling, `request`/`uuid` patch, open M0 gaps this plan closes.
- `.superpowers/sdd/m0-controller-summary.md` — M0 process record.
- `mta/plugins/hidemail-outbound.js`, `mta/config/zonemta.js`, `mta/README.md` — the M0 spike this plan upgrades in place.

## Global Constraints

- Work only in the `feat/send-service` worktree at `/Users/andreymartynyuk/Personal/hide-mail-send` (or its git worktree path). Never edit `/Users/andreymartynyuk/Personal/hide-mail.org`.
- Do not edit `changelog.md`.
- `mta/`'s Docker runtime stays pinned to `node:22-bookworm-slim` (ZoneMTA's own process hard-ceils at Node 22 — `restify`→`spdy` calls the Node-24-removed `process.binding('http_parser')`; confirmed empirically in M0). Backend and root host tooling stay on Node ≥24. Do not "fix" this by bumping `mta/Dockerfile`'s runtime stage.
- `request`'s `require('uuid/v4')` only works via the additive `mta/patches/request+2.88.2.patch` (patch-package, pinned to `request@2.88.2`). Do not add, remove, or reorder `mta/package.json` dependencies in a way that changes the resolved `request` version without regenerating that patch. If this plan's tasks do not change `mta/`'s dependency tree at all, say so in the task report instead of touching the lockfile defensively.
- `mta/`: `npm audit --audit-level=high` must stay exit 0 with exactly the two tolerated moderate advisories (`request`, `zone-mta`→`request`) per `.cursor/rules/dependencies.mdc`. `backend/`: `npm audit --audit-level=high` must stay exit 0 (existing CI gate; this plan adds `uuid`-based id generation and no other new backend runtime dependency unless a task says otherwise).
- Licence type is `outbound` in code, "Send" in UI (no UI in this plan). `sender` is already Sender Check's type — never reuse it.
- Hide Mail has no user accounts; a licence key (`HM-XXXX-XXXX-XXXX-XXXX`) in Redis is the only credential for management endpoints (`X-License-Key` header, existing `attachLicense` middleware pattern). The Send API itself authenticates with a send key (`hm_send_...`) only, per spec 5.4 — never accept a licence key on `/api/outbound/messages`.
- Redis (append-only file) is the only datastore. The backend redeploys within ~5 minutes of every merge to `main`; nothing this plan builds may depend on surviving only in process memory. The event consumer resumes from its Redis Stream consumer-group position, never from in-memory state.
- Send API rate limiting is **per account**, not per client IP (spec 5.4) — default `OUTBOUND_RATE_PER_MINUTE=600`, operator-raisable per account. Do not wrap `/api/outbound/messages` in `apiRateLimiter`'s per-IP buckets; that mechanism is for the existing paid APIs, not this one.
- One recipient per message. No cc/bcc. `Idempotency-Key` header: a repeat within `OUTBOUND_IDEMPOTENCY_TTL_SECONDS` (default 86400) returns the **exact first response** and sends nothing — not a dedupe that silently 200s.
- Send API check order is fixed by spec 5.4 and must not be reordered: (1) per-account rate limit → `429 RATE_LIMITED` with `Retry-After`; (2) send key + licence active → `401`/`403`; (3) From domain verified and not suspended → `403 DOMAIN_NOT_VERIFIED` / `403 DOMAIN_SUSPENDED`; (4) recipient syntax → `422 INVALID_RECIPIENT`; (5) suppression → `422 RECIPIENT_SUPPRESSED`; (6) daily cap → `429 DAILY_LIMIT_REACHED` with reset time; (7) size → `413` at `OUTBOUND_MAX_MESSAGE_BYTES` (default 10 MB). On success, `202 { id, status: "queued" }`; if ZoneMTA refuses the SMTP submission, answer `503` and **do not consume the daily cap counter** (spec 5.4, exact).
- Envelope sender for every outbound message is exactly `b-<messageId>@hm-bounce.<domain>` — this is also how the ZoneMTA plugin and the event consumer recover `messageId`/`domain` (see Task 12's ruling; no custom MIME headers are used for this).
- Domain states are `pending` → `verified` → `broken`; only `verified` may send. "No answer" from every nameserver never changes state (counted, never flips verified→broken). An answer that is wrong or empty does flip verified→broken.
- Uncapped domains (`dailyLimit: null`) are still counted; the cap comparison is only skipped, never the counting.
- A domain's name is unique across all accounts in any state except deleted — the plan rules on the pending-claim race in Task 5.
- A permanent failure that specifically means "this address does not exist" adds the recipient to suppression with reason `hard_bounce`. Policy/reputation/other permanent failures are recorded but never suppress (spec 5.7, exact — this is also Review Focus item 4).
- Out of scope for this plan (do not build): portal UI (M4), customer metrics scrape endpoint / `hm_metrics_...` token / Grafana dashboards / alert rules (M2), ZoneMTA-generated bounce-mail / inbound bounce correlation (M3), link branding, templates, WayForPay self-serve for this product. Per-domain Redis counters built here exist only to serve caps and the account-summary endpoint, not the `hidemail_outbound_*` Prometheus series (M2's job).

## Review Focus

- **Idempotency replay must return the original response, not a fresh one.** A naive implementation re-runs validation on the repeat and returns a *new* `202` with a different-looking body, or worse, re-submits to ZoneMTA. Pin: Task 10's test sends the same `Idempotency-Key` twice with different bodies and asserts the second response is byte-identical to the first and ZoneMTA sees exactly one submission.
- **"No answer" from DNS must never flip a verified domain to `broken`.** A resolver timeout or an authoritative server that simply doesn't respond is easy to conflate with "answered the wrong thing." Pin: Task 4's test feeds a resolver that times out on every nameserver for an already-`verified` domain and asserts the domain stays `verified` with a `no answer` reason recorded, not `broken`.
- **A domain already claimed by another account (even while still `pending`) must return `DOMAIN_TAKEN`, not let the second account silently share or steal it.** Pin: Task 5's test has account A add `mail.example.com` (state `pending`, not yet verified), then account B attempts to add the same name and asserts `409 DOMAIN_TAKEN`.
- **Policy/reputation/mailbox-full permanent failures must never add a suppression entry, only `unknown_recipient`-class ones may.** An overbroad classifier would silently stop legitimate mail for addresses that still exist. Pin: Task 11's test feeds a `550 5.7.1` (policy) response and a `550 5.2.2` (mailbox full) response through the classifier and asserts neither suppresses, while `550 5.1.1` does.
- **A `503` from ZoneMTA submission must not consume the daily cap counter, but a `202` must.** Reversing this either lets a customer's dropped attempt burn their cap, or lets a retried-and-accepted message double-count. Pin: Task 10's test forces the ZoneMTA SMTP submission to fail, asserts `503`, and re-reads the domain's daily counter to confirm it is unchanged from before the call.

---

### Task 1: Outbound licence type and operator account service

**Files:**
- Modify: `backend/services/licenseService.js` (add `'outbound'` to `LICENSE_TYPES`; add `createOperatorLicense`, `extendOperatorLicense`)
- Create: `backend/services/outbound/accountService.js`
- Test: `backend/tests/services/licenseService.test.js` (extend)
- Test: `backend/tests/services/outbound/accountService.test.js`

**Interfaces:**
- Consumes: `licenseService.persistLicense` (already internal/module-private — call via the two new exported functions below, do not export `persistLicense` itself), `licenseService.getLicense`, `licenseService.isActive`.
- Produces for later tasks:
  - `licenseService.createOperatorLicense({ type: 'outbound', days, label }) -> Promise<License>` where `License` gains an `accountId` (string, `crypto.randomUUID()`) and `label` (string) field on top of the existing shape (`key`, `type`, `status`, `createdAt`, `expiresAt`); `ttlSeconds = days * 86400`; no `plan`, `orderReference`, or `recToken`.
  - `licenseService.extendOperatorLicense({ key, days }) -> Promise<License|null>` — adds `days * 86400` seconds on top of `max(license.expiresAt, Date.now())`, re-persists with the new TTL, returns the updated license or `null` if `key` is not an active `outbound` license.
  - `accountService.createAccount({ label, days }) -> Promise<{ accountId, key, expiresAt }>` — calls `createOperatorLicense`, then `SADD`s the license key into Redis set `outbound:accounts:index`.
  - `accountService.listAccounts() -> Promise<Array<{ accountId, key, label, status, expiresAt, remainingDays }>>` — `SMEMBERS outbound:accounts:index`, fetches each license, filters out ones `licenseService.getLicense` returns `null` for (expired and already reaped by Redis TTL), does **not** re-write the index (lazy filtering only).
  - `accountService.extendAccount({ key, days }) -> Promise<License|null>` — thin wrapper over `extendOperatorLicense`.
  - `accountService.getAccountByKey(key) -> Promise<License|null>` — thin wrapper over `getLicense` that also checks `license.type === 'outbound'` (returns `null` otherwise).

- [ ] **Step 1: Write failing tests for `createOperatorLicense` / `extendOperatorLicense`**

```js
it('creates an outbound license with an accountId and no orderReference', async () => {
  const license = await licenseService.createOperatorLicense({ type: 'outbound', days: 30, label: 'Acme Accounting' });
  expect(license.type).toBe('outbound');
  expect(license.accountId).toMatch(/^[0-9a-f-]{36}$/);
  expect(license.label).toBe('Acme Accounting');
  expect(license.orderReference).toBeUndefined();
  const stored = await licenseService.getLicense(license.key);
  expect(stored.accountId).toBe(license.accountId);
});

it('rejects an unknown type', async () => {
  await expect(licenseService.createOperatorLicense({ type: 'pro', days: 30, label: 'x' }))
    .rejects.toThrow(/Unknown license type/);
});

it('extends an outbound license by days from its current expiry', async () => {
  const license = await licenseService.createOperatorLicense({ type: 'outbound', days: 1, label: 'x' });
  const before = license.expiresAt;
  const extended = await licenseService.extendOperatorLicense({ key: license.key, days: 10 });
  expect(extended.expiresAt).toBeGreaterThanOrEqual(before + 10 * 86400 * 1000 - 1000);
});

it('returns null extending an unknown key', async () => {
  expect(await licenseService.extendOperatorLicense({ key: 'HM-NOPE-NOPE-NOPE-NOPE', days: 5 })).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest tests/services/licenseService.test.js`)

- [ ] **Step 3: Implement `createOperatorLicense`/`extendOperatorLicense` in `licenseService.js`**

Add `'outbound'` to `LICENSE_TYPES` (leave `API_KEY_TYPES` untouched — outbound never uses `hm_api_...` keys). `createOperatorLicense` mirrors `createLicense`'s shape but skips the `plan` check, generates `accountId` via `crypto.randomUUID()`, and calls the existing `persistLicense(license, ttlSeconds)` helper already in this file. `extendOperatorLicense` mirrors `renewByPayment`'s TTL-extension math but looks the license up by `key` directly (not by `orderReference`/`recToken`) and checks `license.type === 'outbound'` before extending, returning `null` otherwise.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Write failing tests for `accountService`**

```js
it('creates an account and lists it', async () => {
  const created = await accountService.createAccount({ label: 'Acme', days: 30 });
  const accounts = await accountService.listAccounts();
  expect(accounts.find(a => a.accountId === created.accountId)).toBeTruthy();
});

it('omits an account whose license already expired from the index', async () => {
  const created = await accountService.createAccount({ label: 'Gone', days: 0 }); // 0-day: expires immediately
  // simulate Redis TTL reap by deleting the license key directly
  await redisService.client.del(`license:${created.key}`);
  const accounts = await accountService.listAccounts();
  expect(accounts.find(a => a.accountId === created.accountId)).toBeUndefined();
});

it('getAccountByKey rejects a non-outbound license type', async () => {
  const proLicense = await licenseService.createLicense({ type: 'pro', plan: 'monthly', orderReference: 'o1', ttlSeconds: 86400 });
  expect(await accountService.getAccountByKey(proLicense.key)).toBeNull();
});
```

- [ ] **Step 6: Run — expect FAIL, then implement `backend/services/outbound/accountService.js`, then run — expect PASS**

- [ ] **Step 7: Commit**

```bash
git add backend/services/licenseService.js backend/services/outbound/accountService.js backend/tests/services/licenseService.test.js backend/tests/services/outbound/accountService.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add outbound licence type and operator account service
EOF
)"
```

---

### Task 2: Private-key encryption shared by backend and the ZoneMTA plugin

**Files:**
- Create: `backend/services/outbound/keyCrypto.js`
- Create: `mta/lib/keyCrypto.js`
- Test: `backend/tests/services/outbound/keyCrypto.test.js`
- Test: `mta/tests/lib/keyCrypto.test.js`
- Modify: `backend/config/config.js` (add `config.outbound.keyEncryptionSecret` reading `OUTBOUND_KEY_ENCRYPTION_SECRET`, no default — fail fast like `VALID_DOMAINS` does today if unset in a non-test environment; tests set the env var directly)

**Interfaces:**
- Produces: `encrypt(plaintext: string, secret: string) -> string` and `decrypt(encoded: string, secret: string) -> string` in **both** files, identical wire format: `` `gcm:${ivHex}:${authTagHex}:${cipherHex}` ``, AES-256-GCM, key = `sha256(secret)` (32 bytes), random 12-byte IV generated by `encrypt` (`crypto.randomBytes(12)`). `decrypt` throws on a tag mismatch, a non-`gcm:` prefix, or a malformed part count. Backend's module exports both; `mta/lib/keyCrypto.js` exports only `decrypt` (the plugin never encrypts).
- Consumes: nothing from earlier tasks. This is a leaf module both Task 5 (backend: encrypts on domain creation) and Task 12 (mta: decrypts on signing) depend on.

Two independent implementations are required — `mta/` and `backend/` are separate npm trees that cannot `require` each other's code. The fixture below is the cross-tree compatibility proof; both test files assert against it so a future accidental format drift between the two copies fails CI in both trees, not just one.

- [ ] **Step 1: Write the failing tests in `backend/tests/services/outbound/keyCrypto.test.js`**

```js
const FIXTURE_SECRET = 'test-secret-for-plan-fixture-only';
const FIXTURE_PLAINTEXT = '-----BEGIN PRIVATE KEY-----\nFIXTURE\n-----END PRIVATE KEY-----';
const FIXTURE_ENCODED = 'gcm:0102030405060708090a0b0c:71a349df9ee4f61d8017ec861873f2fd:ff60e41e94256f0f20ce4cd24c8cd05dca84f740da5f8d1dc1af9efc6f4625a39ec770da586e8ee4e15d4839ca015563a4b902f3a50a56f3ed78a97f5a';

test('round-trips an arbitrary plaintext', () => {
  const encoded = keyCrypto.encrypt('hello world', 'some-secret');
  expect(keyCrypto.decrypt(encoded, 'some-secret')).toBe('hello world');
});

test('decrypts the cross-tree fixture', () => {
  expect(keyCrypto.decrypt(FIXTURE_ENCODED, FIXTURE_SECRET)).toBe(FIXTURE_PLAINTEXT);
});

test('rejects a wrong secret with an auth-tag failure', () => {
  const encoded = keyCrypto.encrypt('hello', 'secret-a');
  expect(() => keyCrypto.decrypt(encoded, 'secret-b')).toThrow();
});

test('rejects a malformed encoded string', () => {
  expect(() => keyCrypto.decrypt('not-the-right-format', 'any')).toThrow();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `backend/services/outbound/keyCrypto.js`** using `crypto.createCipheriv('aes-256-gcm', ...)` / `createDecipheriv`, per the format above.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Write the identical fixture test in `mta/tests/lib/keyCrypto.test.js`** (same four tests, `encrypt` omitted from the "rejects a wrong secret" test — construct that case by calling `decrypt` on a string encoded with `secret-a` and decrypting with `secret-b`; since this file has no `encrypt`, hardcode a second small fixture pair for that case the same way Step 1's fixture was produced, or compute it inline in a `beforeAll` using Node's own `crypto` directly in the test file — the test file may use `crypto` itself to set up fixtures; only `mta/lib/keyCrypto.js` itself exports `decrypt` only).

- [ ] **Step 6: Run `cd mta && npm test -- tests/lib/keyCrypto.test.js` — expect FAIL, implement `mta/lib/keyCrypto.js`, expect PASS**

- [ ] **Step 7: Add `OUTBOUND_KEY_ENCRYPTION_SECRET` to `backend/config/config.js`** under a new `config.outbound = { keyEncryptionSecret: ... }` block, following the existing fail-fast pattern used by `getEmailDomains()` (throw if unset) — guard the throw so it only fires outside `NODE_ENV === 'test'` the same way other required-but-test-stubbed config does, or have tests set `process.env.OUTBOUND_KEY_ENCRYPTION_SECRET` before requiring config (check how `VALID_DOMAINS` is handled in existing tests and match that pattern exactly).

- [ ] **Step 8: Commit**

```bash
git add backend/services/outbound/keyCrypto.js backend/tests/services/outbound/keyCrypto.test.js backend/config/config.js mta/lib/keyCrypto.js mta/tests/lib/keyCrypto.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add shared AES-256-GCM private-key encryption format
EOF
)"
```

---

### Task 3: DNS authoritative-nameserver resolver

**Files:**
- Create: `backend/services/outbound/dnsAuthoritative.js`
- Test: `backend/tests/services/outbound/dnsAuthoritative.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks. Default resolver is Node's `dns.promises`, injectable for tests (see signature below) exactly like `senderCheckService`'s `resolver` injection pattern (`backend/services/senderCheckService.js`'s `extractResolverAndOptions`).
- Produces for Task 4:
  - `findAuthoritativeNameservers(name: string, resolver = dns.promises) -> Promise<string[]>` — walks from the full `name` upward one label at a time (`a.b.c.com` → `b.c.com` → `c.com` → `com`) calling `resolver.resolveNs(candidate)`; returns the **first** non-empty NS hostname array found (that candidate is the zone cut). Returns `[]` if no level answers (including the TLD) — callers treat `[]` as "no answer", never as "the zone doesn't exist."
  - `queryAuthoritative({ name, type, nameservers, resolver = dns.promises, timeoutMs = 2000 }) -> Promise<{ answered: Array<{ nameserver: string, records: string[]|null, error: string|null }> }>` where `type` is `'TXT'` or `'CNAME'`. Resolves each nameserver hostname to an IPv4 address first (`resolver.resolve4(ns)`, first result; a nameserver whose A lookup fails gets `error: 'glue_unresolvable'` and is excluded from `answered`), then for each resolved IP creates `new (require('dns').promises.Resolver)()`, calls `.setServers([ip])`, and calls `.resolveTxt(name)` or `.resolve(name, 'CNAME')` with a `timeoutMs`-bounded race (same `Promise.race` + `setTimeout` pattern as `senderCheckService.js`'s `queryOptionalTxt`). A nameserver that times out or errors with `ENOTFOUND`/`ENODATA` is **not** added to `answered` at all (distinct from one that answers with an empty record set, which **is** added to `answered` with `records: []`) — this distinction is what lets Task 4 implement the "no answer never changes state" rule.
  - Both functions are pure with respect to Redis — no reads or writes here. Task 4 owns comparison and state transitions.

- [ ] **Step 1: Write failing tests for `findAuthoritativeNameservers`**

```js
test('returns the first level that answers, walking from the full name up', async () => {
  const resolver = { resolveNs: jest.fn()
    .mockImplementationOnce(() => Promise.reject({ code: 'ENODATA' })) // mail.example.com
    .mockImplementationOnce(() => Promise.resolve(['ns1.example.com', 'ns2.example.com'])) // example.com
  };
  const result = await findAuthoritativeNameservers('mail.example.com', resolver);
  expect(result).toEqual(['ns1.example.com', 'ns2.example.com']);
  expect(resolver.resolveNs).toHaveBeenNthCalledWith(1, 'mail.example.com');
  expect(resolver.resolveNs).toHaveBeenNthCalledWith(2, 'example.com');
});

test('returns [] when every level fails, including the TLD', async () => {
  const resolver = { resolveNs: jest.fn().mockRejectedValue({ code: 'ENOTFOUND' }) };
  expect(await findAuthoritativeNameservers('a.b.com', resolver)).toEqual([]);
});
```

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Write failing tests for `queryAuthoritative`**

```js
test('answered includes every nameserver that responds, even with an empty record set', async () => {
  const resolver = {
    resolve4: jest.fn().mockImplementation((ns) => Promise.resolve([ns === 'ns1' ? '1.1.1.1' : '2.2.2.2'])),
  };
  const MockResolver = jest.fn().mockImplementation(() => ({
    setServers: jest.fn(),
    resolveTxt: jest.fn()
      .mockImplementationOnce(() => Promise.resolve([['v=DKIM1; p=abc']]))
      .mockImplementationOnce(() => Promise.resolve([])),
  }));
  const result = await queryAuthoritative({
    name: 'x._domainkey.example.com', type: 'TXT',
    nameservers: ['ns1', 'ns2'], resolver, ResolverCtor: MockResolver,
  });
  expect(result.answered).toHaveLength(2);
  expect(result.answered[1].records).toEqual([]);
});

test('a nameserver that times out is excluded from answered, not recorded as empty', async () => {
  // resolver whose resolveTxt never resolves within timeoutMs
  const result = await queryAuthoritative({ /* ... */ timeoutMs: 20 });
  expect(result.answered).toHaveLength(0);
});

test('a nameserver whose glue A record does not resolve is excluded from answered', async () => {
  const resolver = { resolve4: jest.fn().mockRejectedValue({ code: 'ENOTFOUND' }) };
  const result = await queryAuthoritative({ name: 'x', type: 'TXT', nameservers: ['ns1'], resolver });
  expect(result.answered).toHaveLength(0);
});
```

Accept a `ResolverCtor` injection parameter (defaulting to `require('dns').promises.Resolver`) purely so tests never construct a real `dns.Resolver`.

- [ ] **Step 4: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/services/outbound/dnsAuthoritative.js backend/tests/services/outbound/dnsAuthoritative.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add authoritative-nameserver DNS resolver for domain verification
EOF
)"
```

---

### Task 4: Domain record definitions and verification orchestration

**Files:**
- Create: `backend/services/outbound/domainRecords.js`
- Create: `backend/services/outbound/domainVerifier.js`
- Test: `backend/tests/services/outbound/domainRecords.test.js`
- Test: `backend/tests/services/outbound/domainVerifier.test.js`

**Interfaces:**
- Consumes: Task 3's `findAuthoritativeNameservers`/`queryAuthoritative`.
- Produces for Task 5:
  - `domainRecords.buildExpectedRecords({ domain, selector, publicKeyPem }) -> Array<{ id, type, host, expected }>` — exactly the three rows of spec 5.3's table: `{ id: 'dkim', type: 'TXT', host: `${selector}._domainkey.${domain}`, expected: `v=DKIM1; k=rsa; p=${derivedPublicKeyBase64}` }` (derive the base64 `p=` value from `publicKeyPem` via `crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }).toString('base64')`), `{ id: 'returnPath', type: 'CNAME', host: `hm-bounce.${domain}`, expected: process.env.OUTBOUND_RETURN_PATH_TARGET }`, `{ id: 'dmarc', type: 'TXT', host: `_dmarc.${domain}`, expected: null }` (DMARC has no single expected value — any syntactically valid `v=DMARC1` record, `p=none` accepted, per spec 5.3).
  - `domainVerifier.verifyDomain({ domain, selector, publicKeyPem, previousState }) -> Promise<{ state: 'pending'|'verified'|'broken', records: Array<{ id, status: 'pass'|'fail', reason: 'missing'|'mismatch'|'multiple_records'|'cname_where_txt_expected'|'no_answer'|null, nameserverAnswers: Array<{nameserver, value, matched}> }> }>` — for each of the three expected records: resolve authoritative nameservers for its `host` (Task 3), query them for the right type, and apply spec 5.3 point 2's exact passing rule: *passes* when `answered.length >= 1` AND every answered nameserver's value matches; *`no_answer`* when `answered.length === 0` (record `status` stays whatever `previousState` implies — see state rule below, never contributes a fail); otherwise *fail* with the most specific `reason` (`missing` if some answered with zero records, `multiple_records` if an answered TXT host returned more than one applicable record, `cname_where_txt_expected` if querying TXT got back only a CNAME redirect indicator, else `mismatch`). DKIM comparison ignores whitespace and TXT string-splitting (`.replace(/\s+/g, '')` before comparing the `p=` value). DMARC comparison only checks "exactly one syntactically valid `v=DMARC1;...` record" (reuse the parse shape from `backend/services/senderCheck/records.js`'s `interpretDmarc`, but do not import it — that module interprets, this one just validates one record is well-formed; copy only the minimal regex/field check, not the whole interpreter).
  - **State transition rule:** `state = 'verified'` iff all three records `status === 'pass'`. If `previousState === 'verified'` and any record is `'fail'` (not `no_answer`), `state = 'broken'`. If `previousState !== 'verified'` and not all pass, `state = 'pending'`. A domain all of whose records answered `no_answer` keeps `previousState` unchanged (this is Review Focus item 2 — write that test here).

- [ ] **Step 1: Write failing tests for `domainRecords.buildExpectedRecords`**

```js
test('builds the three required records with the DKIM public key derived from the PEM', () => {
  process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const records = buildExpectedRecords({ domain: 'mail.example.com', selector: 'hm1', publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) });
  expect(records.find(r => r.id === 'dkim')).toMatchObject({ type: 'TXT', host: 'hm1._domainkey.mail.example.com' });
  expect(records.find(r => r.id === 'dkim').expected).toMatch(/^v=DKIM1; k=rsa; p=/);
  expect(records.find(r => r.id === 'returnPath')).toEqual({ id: 'returnPath', type: 'CNAME', host: 'hm-bounce.mail.example.com', expected: 'rp.hide-mail.org' });
  expect(records.find(r => r.id === 'dmarc')).toMatchObject({ id: 'dmarc', type: 'TXT', host: '_dmarc.mail.example.com', expected: null });
});
```

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Write failing tests for `domainVerifier.verifyDomain`** — mock Task 3's two functions (`jest.mock('../../../services/outbound/dnsAuthoritative')`):

```js
test('verified when every record passes', async () => { /* all three mocked to pass */ });

test('a verified domain whose DKIM record now answers wrong becomes broken, not pending', async () => {
  // DKIM mismatch, others pass, previousState: 'verified'
  const result = await verifyDomain({ domain: 'x.com', selector: 's', publicKeyPem: PEM, previousState: 'verified' });
  expect(result.state).toBe('broken');
  expect(result.records.find(r => r.id === 'dkim').reason).toBe('mismatch');
});

test('no nameserver answering for a verified domain keeps it verified with reason no_answer (Review Focus)', async () => {
  // queryAuthoritative mocked to return { answered: [] } for every record
  const result = await verifyDomain({ domain: 'x.com', selector: 's', publicKeyPem: PEM, previousState: 'verified' });
  expect(result.state).toBe('verified');
  expect(result.records.every(r => r.reason === 'no_answer')).toBe(true);
});

test('a brand-new domain with no records yet is pending, not broken', async () => {
  const result = await verifyDomain({ domain: 'x.com', selector: 's', publicKeyPem: PEM, previousState: 'pending' });
  expect(result.state).toBe('pending');
});
```

- [ ] **Step 4: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/services/outbound/domainRecords.js backend/services/outbound/domainVerifier.js backend/tests/services/outbound/domainRecords.test.js backend/tests/services/outbound/domainVerifier.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add DNS record definitions and verification state machine
EOF
)"
```

---

### Task 5: Domain service, routes, controller, OpenAPI

**Files:**
- Create: `backend/services/outbound/domainService.js`
- Create: `backend/controllers/outbound/domainsController.js`
- Create: `backend/routes/outbound/domains.js`
- Modify: `backend/services/openApiSpec.js` (add `/api/outbound/domains*` paths)
- Test: `backend/tests/services/outbound/domainService.test.js`
- Test: `backend/tests/controllers/outbound/domainsController.test.js`

**Interfaces:**
- Consumes: Task 1's `accountService.getAccountByKey`; Task 2's `keyCrypto.encrypt`; Task 4's `domainRecords.buildExpectedRecords` / `domainVerifier.verifyDomain`.
- Redis keys introduced (document in this task's commit message body, not just code comments): `outbound:domain:meta:<domain>` (JSON: `{ accountId, selector, publicKeyPem, privateKeyEnc, state, suspended, dailyLimit, createdAt, lastCheckedAt, records }`, no TTL — domains don't expire on their own), `outbound:domain:gate:<domain>` (JSON: `{ maySend, selector, privateKeyEnc }`, TTL = the owning account's licence's remaining seconds — the gate record is what Task 12's plugin reads; see "gate record" rule below).
- Produces for Task 6, Task 10, Task 12:
  - `domainService.addDomain({ accountId, domain }) -> Promise<{domain, selector, records, state}>` — normalizes `domain` (lowercase, strip trailing dot), returns `409 DOMAIN_TAKEN` (throw `DomainError('DOMAIN_TAKEN', ...)`) if `outbound:domain:meta:<domain>` already exists under a **different** `accountId` (Review Focus item 3 — ruling: the name is reserved from the moment any account adds it, in any state, not only once verified; this is stricter than a literal reading of spec 5.3 but closes an obvious race and the plan rules it so here). Generates a 2048-bit RSA keypair (`crypto.generateKeyPairSync('rsa', {modulusLength: 2048})`), a unique-per-account-and-domain selector (`crypto.randomBytes(4).toString('hex')`, e.g. `hm-4f2a`), encrypts the private key PEM with `keyCrypto.encrypt(pem, config.outbound.keyEncryptionSecret)`, builds expected records (Task 4), writes the meta record with `state: 'pending'`, `dailyLimit: config.outbound.dailyLimitDefault` (see Task 8's env var), and writes the **gate record** (see below).
  - `domainService.checkDomain({ accountId, domain }) -> Promise<{domain, state, records}>` — loads meta (404 if missing or owned by a different account), calls `domainVerifier.verifyDomain` with `previousState: meta.state`, persists the new `state`/`records`/`lastCheckedAt` back to meta, rewrites the gate record.
  - `domainService.listDomains({ accountId }) -> Promise<Array<{domain, state, suspended, dailyLimit}>>` — needs a per-account index; add Redis SET `outbound:account:<accountId>:domains` (members = domain names), `SADD`ed in `addDomain`, `SREM`ed in `removeDomain`.
  - `domainService.removeDomain({ accountId, domain }) -> Promise<boolean>` — ownership check, deletes the meta key and the gate key outright (freeing the name for any account — a deliberate simplification over "removed domains are treated the same as suspended" from spec 5.5, which concerns *queued mail already in flight*, not the name's future availability; queued mail already in ZoneMTA keeps deferring regardless of whether the gate key is deleted or merely flipped false, since "missing" and "maySend:false" are handled identically by Task 12's plugin), `SREM`s the account-domains index.
  - **Gate record rule** (used by every function above that writes it): `maySend = state === 'verified' && !suspended && accountLicenseIsActive`; look up the account's own licence via `accountService.getAccountByKey`-style lookup (accept an injected `getAccount` or call `licenseService.getLicense` directly keyed by... **note:** `accountId` is not a Redis key itself — Task 1 only indexes by license *key*, not `accountId`. Add a second small Redis index here: `outbound:account:<accountId>:licenseKey` (string, written once in Task 1's `accountService.createAccount`, no TTL) so domain code can go `accountId -> licenseKey -> license`. Amend Task 1's `createAccount` to also `SET outbound:account:<accountId>:licenseKey <key>` — call this out explicitly in this task's implementer brief as a one-line addition to Task 1's file, since Task 1 is already complete and reviewed by the time this task runs.) TTL of the gate key = `Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000))`; if the license is missing/inactive, delete the gate key outright instead of writing `maySend: false` (Task 12's plugin already treats "missing" as hold, and a deleted key needs no future cleanup).

- [ ] **Step 1: Write failing tests for `addDomain`/`checkDomain`/`listDomains`/`removeDomain`** covering: successful add returns `pending` with three records; second account adding the same pending name gets `DomainError('DOMAIN_TAKEN')`; `checkDomain` on a domain whose DNS now resolves correctly flips `pending` → `verified` and writes a gate record with `maySend: true`; `removeDomain` deletes both Redis keys and the account's index no longer lists it; `addDomain` for an account whose licence has 10 days left writes a gate key whose TTL is within a few seconds of 10 days (mock `domainVerifier`/`dnsAuthoritative` — this task does not re-test DNS logic, Task 4 already covers it).

- [ ] **Step 2: Run — expect FAIL, implement `domainService.js`, expect PASS**

- [ ] **Step 3: Write failing tests for the controller/routes** (supertest, following `backend/tests/controllers/*` conventions) — `POST /api/outbound/domains` with `X-License-Key`, `GET /api/outbound/domains`, `POST /api/outbound/domains/:domain/check`, `DELETE /api/outbound/domains/:domain`; a request with a licence key of the wrong type (`sender`) gets `403`; a request with no licence key gets `401`.

- [ ] **Step 4: Run — expect FAIL, implement `domainsController.js` + `routes/outbound/domains.js`, expect PASS**

New middleware needed here: `backend/middleware/outboundAuth.js` — `requireOutboundLicense` (chains after the existing `attachLicense`: `403` if `!req.license || req.license.type !== 'outbound'`, else sets `req.accountId = req.license.accountId`). Create this file in this task (it is also consumed by Tasks 7, 10 (account summary), and 11's routes — name it precisely so later tasks' Interfaces blocks can cite it: `requireOutboundLicense(req, res, next)`).

- [ ] **Step 5: Add the three domain paths to `backend/services/openApiSpec.js`**, following the existing `/api/sender-check` entry's shape (summary, requires-header note, request/response schema).

- [ ] **Step 6: Commit**

```bash
git add backend/services/outbound/domainService.js backend/services/outbound/accountService.js backend/middleware/outboundAuth.js backend/controllers/outbound/domainsController.js backend/routes/outbound/domains.js backend/services/openApiSpec.js backend/tests/services/outbound/domainService.test.js backend/tests/controllers/outbound/domainsController.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add domain add/list/check/remove API with DNS-verified gate records
EOF
)"
```

---

### Task 6: DNS recheck timer

**Files:**
- Create: `backend/services/outbound/dnsRecheckJob.js`
- Modify: `backend/server.js` (start the job)
- Test: `backend/tests/services/outbound/dnsRecheckJob.test.js`

**Interfaces:**
- Consumes: Task 5's `domainService.checkDomain`; needs a way to enumerate every domain across every account — add Redis SET `outbound:domains:index` (all domain names, regardless of account), `SADD`ed/`SREM`ed alongside the per-account index in Task 5's `addDomain`/`removeDomain` (call this out to the implementer as a one-line addition to Task 5's already-committed `domainService.js`, same pattern as Task 5's own note about Task 1).
- Produces: `dnsRecheckJob.runOnce() -> Promise<{checked: number, becameBroken: string[]}>` (one pass, used directly by the test and by the interval below) and `dnsRecheckJob.start() -> () => void` (returns a stop function; sets `setInterval(runOnce, (process.env.OUTBOUND_DNS_RECHECK_SECONDS || 3600) * 1000)`, call `.unref()` on the interval handle so it never blocks process exit in tests).

- [ ] **Step 1: Write failing tests** — `runOnce` calls `checkDomain` for every domain in `outbound:domains:index` (mock `domainService`), skips a domain that throws (logs and continues — one bad domain must not stop the sweep), and returns the list of domains whose state became `broken` this pass (for the implementer's own log line; no alerting in this plan, that's M2).

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Wire `dnsRecheckJob.start()` into `backend/server.js`'s existing async startup block** (the one that already calls `redisService.initializeDomains` and `forwardingService.initialize()`), guarded so tests importing `server.js` don't spin up a real interval — check how `forwardingService.initialize()` is itself skipped/mocked under `NODE_ENV=test` (see `backend/__mocks__/server.js` and existing test setup) and follow the same convention.

- [ ] **Step 4: Commit**

```bash
git add backend/services/outbound/dnsRecheckJob.js backend/services/outbound/domainService.js backend/server.js backend/tests/services/outbound/dnsRecheckJob.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add hourly DNS recheck job for verified domains
EOF
)"
```

---

### Task 7: Send keys

**Files:**
- Create: `backend/services/outbound/sendKeyService.js`
- Create: `backend/controllers/outbound/sendKeysController.js`
- Create: `backend/routes/outbound/sendKeys.js`
- Modify: `backend/middleware/outboundAuth.js` (add `requireSendKey`)
- Modify: `backend/services/openApiSpec.js`
- Test: `backend/tests/services/outbound/sendKeyService.test.js`
- Test: `backend/tests/controllers/outbound/sendKeysController.test.js`

**Interfaces:**
- Consumes: Task 1's `accountService.getAccountByKey` (and the `outbound:account:<accountId>:licenseKey` index Task 5 added, to re-derive remaining TTL); Task 5's `requireOutboundLicense`.
- Redis key: `outbound:sendkey:<sha256hex>` → JSON `{ accountId, name, createdAt }`, TTL = the account licence's remaining seconds at issue time (per spec 5.2: "valid as long as the licence" — no 30-day cap like the other products' `hm_api_...` keys). Secondary index `outbound:account:<accountId>:sendkeys` → Redis SET of sha256 hashes, so `listSendKeys` doesn't need a `KEYS` scan and so `name`/`createdAt` can be shown without the raw key ever being stored twice.
- Produces for Task 10, Task 12 n/a (Task 12 only reads domain gate records, never send keys):
  - `sendKeyService.createSendKey({ accountId, name }) -> Promise<{ key, name, createdAt }>` — `key = 'hm_send_' + crypto.randomBytes(24).toString('hex')` (mirrors `licenseService.generateApiKey`'s shape), stores `sha256(key)` as above, `SADD`s the hash into the account's index, returns the **raw key once**.
  - `sendKeyService.listSendKeys({ accountId }) -> Promise<Array<{ name, createdAt, maskedKey }>>` — `maskedKey` is the last 4 hex chars only, same masking idea as `licenseService.maskKey`; never returns the raw key or its hash.
  - `sendKeyService.revokeSendKey({ accountId, name }) -> Promise<boolean>` — finds the hash in the account's index whose stored `name` matches, deletes both the key and its index entry.
  - `sendKeyService.validateSendKey(rawKey) -> Promise<{accountId, name}|null>` — hash, `GET`, `null` if missing.
  - `requireSendKey(req, res, next)` in `outboundAuth.js`: extracts `Bearer hm_send_...` from `Authorization` only (per spec 5.4 — **not** `X-License-Key`, that header is for management endpoints only, see Global Constraints), `401` if absent/invalid, else re-checks the owning account's licence is still active (`accountService.getAccountByKey`-equivalent lookup by the send key's stored `accountId` via the licence-key index) and `403`s if not, else sets `req.accountId`.

- [ ] **Step 1: Write failing tests for the service** — create returns a key matching `/^hm_send_[0-9a-f]{48}$/`; list never includes the raw key or a 64-char hash, only a 4-char mask; revoke by name removes it from both the hash key and the index so a second `validateSendKey` call returns `null`; `validateSendKey` on garbage returns `null` without throwing.

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Write failing tests for `requireSendKey`** — valid key + active account licence → `next()` with `req.accountId` set; valid key whose account's licence has since expired → `403`; missing/garbage `Authorization` → `401`; a `X-License-Key` header alone (no Bearer) → `401` (proves the two auth paths are not interchangeable — this is worth its own assertion given Global Constraints calls it out explicitly).

- [ ] **Step 4: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 5: Write failing tests for the controller/routes** — `POST /api/outbound/send-keys` (licence-key-authed, per spec 5.2 "created ... in the portal" via the licence credential since there is no portal yet), `GET /api/outbound/send-keys`, `DELETE /api/outbound/send-keys/:name`.

- [ ] **Step 6: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 7: Add the three send-key paths to `openApiSpec.js`**

- [ ] **Step 8: Commit**

```bash
git add backend/services/outbound/sendKeyService.js backend/middleware/outboundAuth.js backend/controllers/outbound/sendKeysController.js backend/routes/outbound/sendKeys.js backend/services/openApiSpec.js backend/tests/services/outbound/sendKeyService.test.js backend/tests/controllers/outbound/sendKeysController.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add send key issuance, listing, and revocation
EOF
)"
```

---

### Task 8: Message store, idempotency store, daily cap service

**Files:**
- Create: `backend/services/outbound/messageStore.js`
- Create: `backend/services/outbound/capService.js`
- Modify: `backend/config/config.js` (add `config.outbound.dailyLimitDefault`, `messageRetentionDays`, `idempotencyTtlSeconds`, `maxMessageBytes` — env vars `OUTBOUND_DAILY_LIMIT_DEFAULT` default `1000`, `OUTBOUND_MESSAGE_RETENTION_DAYS` default `30`, `OUTBOUND_IDEMPOTENCY_TTL_SECONDS` default `86400`, `OUTBOUND_MAX_MESSAGE_BYTES` default `10485760`)
- Test: `backend/tests/services/outbound/messageStore.test.js`
- Test: `backend/tests/services/outbound/capService.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (this task's two services are leaves used by Task 10 and Task 13).
- Redis keys: `outbound:message:<id>` (JSON, no body/subject per spec 5.4 — `{ id, accountId, domain, recipient, reference, status, createdAt, lastEventAt, lastResponse }`, TTL `config.outbound.messageRetentionDays * 86400`); `outbound:idempotency:<accountId>:<idempotencyKey>` (JSON `{ statusCode, body }` of the **first** response, TTL `config.outbound.idempotencyTtlSeconds`); `outbound:cap:<domain>:<YYYYMMDD>` (plain integer string via `INCR`, UTC date, TTL set to seconds-until-next-UTC-midnight on the first increment — same `current === 1 → expire` pattern as `apiRateLimiter.js`).
- Produces for Task 10, Task 13:
  - `messageStore.createMessage({ id, accountId, domain, recipient, reference }) -> Promise<void>` — writes `status: 'queued'`.
  - `messageStore.getMessage(id) -> Promise<Message|null>`.
  - `messageStore.updateStatus({ id, status, response }) -> Promise<void>` — `status` one of `'delivered'|'deferred'|'held'|'bounced'`; sets `lastEventAt`/`lastResponse`; **idempotent by construction** — always an unconditional overwrite with the same shape, so applying the same event twice leaves the record identical (no counter inside this record to double-increment; see Review Focus and Task 13 for the one place that matters).
  - `idempotency.getReplay({ accountId, idempotencyKey }) -> Promise<{statusCode, body}|null>` and `idempotency.storeReplay({ accountId, idempotencyKey, statusCode, body }) -> Promise<void>` — co-locate in `messageStore.js` as a second export, not a separate file (small, same Redis-key family, no reason to split per the writing-plans file-structure rule).
  - `capService.getDailyLimit(domain) -> Promise<number|null>` — reads `outbound:domain:meta:<domain>`'s `dailyLimit` field (depends on Task 5's meta shape — read-only here).
  - `capService.checkAndIncrement(domain) -> Promise<{allowed: boolean, remaining: number|null, resetAt: number}>` — reads the limit; if `null` (unlimited), still `INCR`s the counter (spec: uncapped domains are still counted) and always returns `allowed: true`; if a positive integer, `INCR`s first then compares the **post-increment** value against the limit — if it exceeds the limit, **decrement back** (`DECR`) before returning `allowed: false` (this is what makes the "cap counter is not consumed on refusal" rule exact: the attempted-but-refused request must not leave the counter one higher than before the call).
  - `capService.setDailyLimit(domain, limit: number|null) -> Promise<void>` — writes into the Task 5 meta record (read-modify-write; used by Task 14's operator script).

- [ ] **Step 1: Write failing tests for `messageStore`/idempotency** — create then get round-trips; `updateStatus` twice with the same status leaves one identical record (no field drifts); idempotency replay returns exactly what was stored and `null` before anything is stored.

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Write failing tests for `capService`** — first message under a limit of 5 returns `allowed: true, remaining: 4`; the 6th returns `allowed: false` and the stored counter is still `5`, not `6` (Review Focus-adjacent — pin this exact behavior here since it's the mechanism Task 10's Review Focus item 4 relies on); a domain with `dailyLimit: null` always returns `allowed: true` and the counter still increments every call (`checkAndIncrement` called 3 times on an unlimited domain → counter reads `3`).

- [ ] **Step 4: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/services/outbound/messageStore.js backend/services/outbound/capService.js backend/config/config.js backend/tests/services/outbound/messageStore.test.js backend/tests/services/outbound/capService.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add message store, idempotency replay, and daily cap counters
EOF
)"
```

---

### Task 9: Account-level rate limiter

**Files:**
- Create: `backend/services/outbound/accountRateLimiter.js`
- Modify: `backend/config/config.js` (add `config.outbound.ratePerMinuteDefault`, env `OUTBOUND_RATE_PER_MINUTE` default `600`)
- Test: `backend/tests/services/outbound/accountRateLimiter.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Redis keys: `outbound:ratelimit:<accountId>:<YYYYMMDDHHmm>` (`INCR`, TTL 70s on first increment — fixed one-minute window, same style as `apiRateLimiter.js`'s per-IP buckets); `outbound:ratelimit:override:<accountId>` (plain integer string, no TTL, operator-set via Task 14's script; absent = use the default).
- Produces for Task 10:
  - `accountRateLimiter.checkAndIncrement(accountId) -> Promise<{allowed: boolean, limit: number, retryAfterSeconds: number}>` — reads the override or falls back to `config.outbound.ratePerMinuteDefault`; `retryAfterSeconds` is seconds to the top of the next minute.
  - `accountRateLimiter.setOverride(accountId, perMinute: number) -> Promise<void>` (Task 14's operator script calls this).

- [ ] **Step 1: Write failing tests** — under the default limit, N calls within one minute all `allowed: true`; the `(default+1)`th call in the same minute window is `allowed: false` with a `retryAfterSeconds` between 1 and 60; `setOverride` then `checkAndIncrement` honors the new number immediately.

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Commit**

```bash
git add backend/services/outbound/accountRateLimiter.js backend/config/config.js backend/tests/services/outbound/accountRateLimiter.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add per-account send-rate limiter
EOF
)"
```

---

### Task 10: Send API — send, fetch, account summary

**Files:**
- Create: `backend/services/outbound/sendService.js`
- Create: `backend/controllers/outbound/messagesController.js`
- Create: `backend/controllers/outbound/accountController.js`
- Create: `backend/routes/outbound/messages.js`
- Create: `backend/routes/outbound/account.js`
- Create: `backend/routes/outbound/index.js` (mounts `domains.js`, `sendKeys.js`, `messages.js`, `account.js` — this is where `backend/server.js` gets one `app.use('/api/outbound', outboundRoutes)` line)
- Modify: `backend/server.js` (mount the router)
- Modify: `backend/services/openApiSpec.js`
- Test: `backend/tests/services/outbound/sendService.test.js`
- Test: `backend/tests/controllers/outbound/messagesController.test.js`

**Interfaces:**
- Consumes: Task 5's `domainService` (read domain meta for verified/suspended check, by domain name derived from `from.email`'s host), Task 7's `requireSendKey`, Task 8's `capService`/`messageStore`/idempotency, Task 9's `accountRateLimiter`, `nodemailer` (already a backend dependency) for MIME construction, `node:net`/`nodemailer`'s SMTP transport pointed at ZoneMTA's feeder (`ZONEMTA_SMTP_HOST`/`ZONEMTA_SMTP_PORT`, default `zonemta`/`2526` — add to `config.js` under `config.outbound.zoneMta`).
- Produces for Task 13 (indirectly, via the message record Task 8 already defines — no new interface needed): nothing further downstream; this is the top of the stack for M1's backend.
- **Envelope-from rule** (binding for Task 12 too): `envelopeFrom = \`b-${messageId}@hm-bounce.${domain}\`` where `messageId` is this service's own generated id (`crypto.randomUUID()`), exactly as spec 5.4/5.6 require. No `X-HM-Message-Id`/`X-HM-Domain` custom headers are set — see Task 12's ruling for why the envelope-from address alone is sufficient and is what this plan uses end-to-end.

- [ ] **Step 1: Write failing tests for `sendService.sendMessage`**, one test per check in the exact Global-Constraints order, each asserting its own error code and that **no later check ran** (e.g. the rate-limit test asserts the send-key lookup was never called):

```js
test('rate limited before anything else', async () => { /* accountRateLimiter mocked to refuse */ });
test('403 DOMAIN_NOT_VERIFIED for a pending domain', async () => { /* domainService mocked: state pending */ });
test('403 DOMAIN_SUSPENDED takes priority over daily cap', async () => { /* suspended: true, even with cap room */ });
test('422 INVALID_RECIPIENT for a malformed address', async () => {});
test('422 RECIPIENT_SUPPRESSED', async () => { /* suppressionService mocked (stub interface for now; Task 11 implements it — inject as a parameter, see below) */ });
test('429 DAILY_LIMIT_REACHED with a resetAt', async () => { /* capService mocked to refuse */ });
test('413 over OUTBOUND_MAX_MESSAGE_BYTES, before ZoneMTA is ever contacted', async () => {});
test('503 and cap NOT consumed when ZoneMTA SMTP submission fails', async () => {
  // capService.checkAndIncrement is a real (non-mocked) in-memory-redis call here, not mocked,
  // specifically so this test can re-read the counter afterwards — this is the Review Focus pin.
  const before = await capService.checkAndIncrement.__test_peek(domain); // or re-read via a second checkAndIncrement call pattern documented in capService's own test file
  await expect(sendService.sendMessage({ ... })).rejects.toMatchObject({ code: 'ZONEMTA_UNAVAILABLE' });
  // assert the domain's counter equals `before`, not `before + 1`
});
test('202 on success, idempotency key replay returns the identical first response on a second call with a different body', async () => {
  const first = await sendService.sendMessage({ idempotencyKey: 'abc', accountId: 'a1', recipient: 'x@example.org', ... });
  const second = await sendService.sendMessage({ idempotencyKey: 'abc', accountId: 'a1', recipient: 'DIFFERENT@example.org', ... });
  expect(second).toEqual(first); // Review Focus pin — not just "didn't send twice", the body must match exactly
  expect(zoneMtaTransportMock.sendMail).toHaveBeenCalledTimes(1);
});
```

`sendService.sendMessage` takes an injectable `{ domainService, requireSendKey-resolved accountId, capService, accountRateLimiter, suppressionService, messageStore, mimeTransport }` object (or individual injected modules — match whatever dependency-injection style `senderCheckService`'s resolver injection already established in this codebase) so every check above can be tested in isolation without a real Redis or a real SMTP connection; the real wiring (actual Redis-backed services, a real `nodemailer.createTransport({host, port})` pointed at ZoneMTA) is the default when no overrides are passed, used only by Task 10's controller.

Note: `suppressionService` is Task 11's deliverable, not yet built when this task runs. Define its consumed shape now — `suppressionService.isSuppressed({accountId, email}) -> Promise<boolean>` — and inject a stub returning `false` in every test except the one `RECIPIENT_SUPPRESSED` test (which injects a stub returning `true`). Task 11 implements the real module to this exact signature; this task does not block on Task 11 existing yet.

- [ ] **Step 2: Run — expect FAIL, implement `sendService.js`, expect PASS**

- [ ] **Step 3: Write failing tests for `GET /api/outbound/messages/:id`** (send-key authed; a message belonging to a different account's send key is `404`, not `403` — don't leak existence) and `GET /api/outbound/account/summary` (licence-key authed via `requireOutboundLicense`; returns each domain's state/dailyLimit/sent-today by reading `capService`+`domainService`, no raw message bodies).

- [ ] **Step 4: Run — expect FAIL, implement controllers/routes, expect PASS**

- [ ] **Step 5: Wire `backend/routes/outbound/index.js` into `backend/server.js`** at `app.use('/api/outbound', outboundRoutes)`, mirroring exactly how `apiRoutes`/`mcpRoutes` are already mounted in that file.

- [ ] **Step 6: Add `/api/outbound/messages` (POST, GET /:id) and `/api/outbound/account/summary` to `openApiSpec.js`**

- [ ] **Step 7: Commit**

```bash
git add backend/services/outbound/sendService.js backend/controllers/outbound/messagesController.js backend/controllers/outbound/accountController.js backend/routes/outbound/messages.js backend/routes/outbound/account.js backend/routes/outbound/index.js backend/server.js backend/config/config.js backend/services/openApiSpec.js backend/tests/services/outbound/sendService.test.js backend/tests/controllers/outbound/messagesController.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add send API with ordered checks, idempotency, and account summary
EOF
)"
```

---

### Task 11: Bounce classifier and suppression

**Files:**
- Create: `backend/services/outbound/bounceClassifier.js`
- Create: `backend/services/outbound/suppressionService.js`
- Create: `backend/controllers/outbound/suppressionsController.js`
- Create: `backend/routes/outbound/suppressions.js`
- Modify: `backend/routes/outbound/index.js` (mount the new router)
- Modify: `backend/services/openApiSpec.js`
- Test: `backend/tests/services/outbound/bounceClassifier.test.js`
- Test: `backend/tests/services/outbound/suppressionService.test.js`
- Test: `backend/tests/controllers/outbound/suppressionsController.test.js`

**Interfaces:**
- Consumes: `backend/services/bounceRead/statusCatalog.js`'s existing `classify(status, action)` (the "existing Bounce Read catalogue" spec 5.7 names — call it, do not duplicate its hard/soft logic).
- Redis key: `outbound:suppression:<accountId>` (Redis HASH, field = lowercased email, value = JSON `{reason, addedAt}` where `reason` is `'hard_bounce'|'manual'`).
- Produces for Task 10 (already consumed via the injected-stub shape in Task 10 — wire the real implementation in now) and Task 13:
  - `bounceClassifier.classifyDeliveryResponse(responseText: string) -> {class: 'hard'|'soft'|'unknown', category: 'unknown_recipient'|'mailbox'|'policy'|'reputation'|'held'|'other', shouldSuppress: boolean}` — if `responseText` contains the literal substring `Domain held` (Task 12's own defer message), return `{class: 'soft', category: 'held', shouldSuppress: false}` immediately (held mail is never a suppression signal). Otherwise extract an RFC 3463 enhanced status code via `/\b([245]\.\d{1,3}\.\d{1,3})\b/`; if found, call `statusCatalog.classify(code)` for `class`; map `category` from a small explicit table: `{'5.1.1':'unknown_recipient','5.1.2':'unknown_recipient','5.1.3':'unknown_recipient','5.1.10':'unknown_recipient','5.2.1':'mailbox','5.2.2':'mailbox','5.7.1':'policy','5.7.26':'policy'}`, defaulting unmapped `5.x` codes to `'other'` and unmapped `4.x` to `'other'` with `class: 'soft'`; if no enhanced code is found, fall back to the bare three-digit SMTP code's leading digit (`5xx`→hard/`other`, `4xx`→soft/`other`). `shouldSuppress = class === 'hard' && category === 'unknown_recipient'` — this single line is the Review Focus pin; write it as its own named export, not inlined, so the fix loop (if the reviewer disagrees with a mapping) touches one obvious line.
  - `suppressionService.isSuppressed({accountId, email}) -> Promise<boolean>` — exact signature Task 10 already injects against.
  - `suppressionService.addSuppression({accountId, email, reason}) -> Promise<void>`, `suppressionService.removeSuppression({accountId, email}) -> Promise<boolean>`, `suppressionService.listSuppressions({accountId}) -> Promise<Array<{email, reason, addedAt}>>`, `suppressionService.exportSuppressionsCsv({accountId}) -> Promise<string>` (header row `email,reason,added_at`, one row per entry — spec 5.4 "export").

- [ ] **Step 1: Write failing tests for `bounceClassifier`** — the four Review-Focus-pinned cases from the Global section (`5.1.1`→suppress, `5.7.1`→no suppress, `5.2.2`→no suppress) plus: a response containing `Domain held` never suppresses regardless of any status code also present in the text; a response with no parseable code at all falls back to the bare SMTP code.

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Write failing tests for `suppressionService`** — add then `isSuppressed` is `true`; remove then `isSuppressed` is `false`; `listSuppressions` round-trips reason/addedAt; CSV export's header and one data row match exactly; suppression is scoped per account (account A's suppression of `x@example.org` does not suppress it for account B).

- [ ] **Step 4: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 5: Write failing tests for the controller/routes** — `GET`/`POST`/`DELETE /api/outbound/suppressions`, `GET /api/outbound/suppressions/export` (returns `text/csv`), all licence-key authed via `requireOutboundLicense` (suppression management is an account-level operation like domains, not a send-key operation).

- [ ] **Step 6: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 7: Add the suppression paths to `openApiSpec.js`**

- [ ] **Step 8: Rewire `sendService.js` (Task 10) to call the real `suppressionService.isSuppressed` instead of its test-only stub** — this is a one-line change in the production wiring (not the test file, which keeps its injected stubs); re-run Task 10's full test file to confirm nothing regressed.

- [ ] **Step 9: Commit**

```bash
git add backend/services/outbound/bounceClassifier.js backend/services/outbound/suppressionService.js backend/services/outbound/sendService.js backend/controllers/outbound/suppressionsController.js backend/routes/outbound/suppressions.js backend/routes/outbound/index.js backend/services/openApiSpec.js backend/tests/services/outbound/bounceClassifier.test.js backend/tests/services/outbound/suppressionService.test.js backend/tests/controllers/outbound/suppressionsController.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add bounce classification and per-account suppression list
EOF
)"
```

---

### Task 12: ZoneMTA plugin upgrade — real domains, real signing

**Files:**
- Modify: `mta/plugins/hidemail-outbound.js`
- Modify: `mta/config/zonemta.js`
- Modify: `mta/tests/plugins/hidemail-outbound.test.js` (the M0 file — most of its existing tests change shape; this is expected, call it out in the task report rather than treating every diff as a regression)
- Test: unchanged filename, new/rewritten cases

**Interfaces:**
- Consumes: Task 2's `mta/lib/keyCrypto.js` `decrypt`; Task 5's gate-record shape (`outbound:domain:gate:<domain>` → `{maySend, selector, privateKeyEnc}`).
- Produces for Task 13: appends to Redis Stream `outbound:events` via `XADD outbound:events '*' type <t> messageId <id> domain <d> response <r> at <iso>` — field names exactly `type`/`messageId`/`domain`/`response`/`at` (Task 13 reads these field names verbatim).

**Ruling — no custom MIME headers.** Spec 5.6 describes a `message:headers` hook reading `X-HM-Message-Id`/`X-HM-Domain`. Empirical inspection of the installed `zone-mta@3.10.3` + `@zone-eu/wild-plugins` source (confirmed by grep, not assumed) shows: (a) `delivery.messageId` is never assigned anywhere in zone-mta's own code, so it is always `undefined` and useless as a correlation id; (b) the `log:entry` hook's payload is a flat object (`id`, `seq`, `action`, `from`, `returnPath`, `to`, `mx`, `response`, `messageId`, …) with **no** `headers` field, so a header stashed via `message:headers` would not be readable from `log:entry` without a separate persistence mechanism this plan has no evidence for. Every one of `sender:fetch`, `sender:connection`, and `log:entry` (confirmed at `node_modules/zone-mta/lib/sender.js:229,983` and `node_modules/@zone-eu/wild-plugins/index.js:852`), however, **does** carry the envelope-from address (`delivery.envelope.from` / `entry.returnPath` / `entry.from`) — and spec 5.4 already mandates that address be exactly `b-<messageId>@hm-bounce.<domain>`. This plan therefore parses `messageId` and `domain` out of that one address everywhere, and does **not** implement a `message:headers` hook or any custom header. This fully satisfies spec 5.6's functional intent (every hook that needs the domain or message id can get both) with less code and zero reliance on an unverified internal mechanism. Record this ruling in the task report.

- Shared parsing helper (new, small, top of the plugin file): `parseBounceEnvelopeFrom(from: string) -> {messageId: string, domain: string} | null` — regex `/^b-([^@]+)@hm-bounce\.(.+)$/i`; returns `null` on no match (defense in depth for any message that somehow isn't ours — treat as hold, same as missing gate record, no special-case branch needed beyond "no match ⇒ `domainOf` returns `null` ⇒ gate lookup for `null` domain is always a miss ⇒ hold").
- `sender:fetch(delivery)`: unchanged shape from M0 (hold via `responseCode: 451, action: 'defer'`), but `domain = parseBounceEnvelopeFrom(delivery.envelope.from)?.domain`, gate lookup key changes from `outbound:spike:domain:<domain>` to `outbound:domain:gate:<domain>`, and the cached value is now the parsed JSON object (`{maySend, selector, privateKeyEnc}`) not a raw string; hold when the key is missing **or** `maySend !== true`.
- `sender:connection(delivery, options, next)`: `domain = parseBounceEnvelopeFrom(delivery.envelope.from)?.domain`; read the same per-domain cache entry used by `sender:fetch` (same domain, same short-TTL cache — one cache, not two) to get `{selector, privateKeyEnc}`; `decrypt(privateKeyEnc, process.env.OUTBOUND_KEY_ENCRYPTION_SECRET)` (Task 2); attach `delivery.dkim.keys = (delivery.dkim.keys || []).concat({ domainName: domain, keySelector: selector, privateKey: decryptedPem })`. Remove the M0 `app.config.dkim` fixed-key path entirely — there is no more "spike fixed key," every signature now uses the sending domain's own real key, so `dkim: aligned: false` from the M0 report's open item is resolved as a side effect.
- `log:entry(entry, done)`: register this new hook. If `entry.action` is not one of `'ACCEPTED'|'DEFERRED'|'REJECTED'`, call `done()` and return (ignore `QUEUED`/`DROP`/`NOQUEUE` — out of scope, see plan ruling above). Parse `{messageId, domain}` from `entry.returnPath || entry.from`; if parsing fails, log and return without writing an event (never crash the sender on a malformed/foreign envelope). Map `action` → stream `type`: `ACCEPTED`→`'delivered'`, `DEFERRED`→`'deferred'`, `REJECTED`→`'bounced'`. `XADD outbound:events '*' type <type> messageId <messageId> domain <domain> response <entry.response || ''> at <new Date().toISOString()>` on the same Redis client the plugin already holds. Always call `done()` (or resolve), even on a Redis error (log it, don't let a Redis hiccup delay or crash message sending — this hook observes, it never gates).
- **Bounded cache.** Replace the M0 `Map` (confirmed in the M0 report as unbounded) with a cap: `MAX_CACHE_ENTRIES = 5000`; on `cache.set`, if `cache.size > MAX_CACHE_ENTRIES`, delete the first (oldest-inserted) key via `cache.keys().next().value` before inserting — a simple insertion-order eviction, not a full LRU, sufficient at this scale and documented as such in a comment (matches the M0 report's "worth bounding" note).
- `mta/config/zonemta.js`: remove the M0 spike's `zones.default.host`/`port` smarthost override entirely (so ZoneMTA resolves and delivers to the recipient's real MX — the production behavior; the spike's `host.docker.internal`/fake-receiver override was test-only), remove `dkim:` from the `hidemail-outbound` plugin config block (no longer used — the plugin now decrypts per-domain keys, not a fixed config key), change `redis:` to `process.env.PLUGIN_REDIS_URL || 'redis://127.0.0.1:6379/0'` (product Redis db 0, not the spike's db 3 — confirm against whatever db index `backend/config/config.js`'s `REDIS_URL` actually points at and match it exactly; grep `backend/.env.example`/`docker-compose.yml`'s `REDIS_URL` for the db index backend uses and mirror it here, do not invent a new one), and set the EHLO/HELO identity from `process.env.OUTBOUND_HELO_HOSTNAME`: **grep `mta/node_modules/zone-mta/lib/sender.js` for the exact config key controlling the outbound EHLO/HELO hostname** (it is a zone-level or top-level option — confirm the key name empirically against the installed source, the same way the M0 report confirmed the Node-22 ceiling, before wiring it) and set it from that env var in the `zones.default` block.

- [ ] **Step 1: Rewrite the failing unit tests in `mta/tests/plugins/hidemail-outbound.test.js`**

Keep the file's existing mock-`app`/`runHook` harness (M0's pattern is sound); change the Redis-mock's `get` responses from raw strings to JSON strings matching the new gate shape, and the asserted Redis key from `outbound:spike:domain:mail.example.com` to `outbound:domain:gate:mail.example.com`. New/changed cases:

```js
test('parses messageId and domain from a well-formed bounce envelope', () => {
  expect(parseBounceEnvelopeFrom('b-abc123@hm-bounce.mail.example.com')).toEqual({ messageId: 'abc123', domain: 'mail.example.com' });
});

test('returns null for an envelope that is not ours', () => {
  expect(parseBounceEnvelopeFrom('someone@elsewhere.com')).toBeNull();
});

test('holds when the gate record is missing', async () => { /* mockGet resolves null; same 451/defer assertions as M0 */ });

test('holds when the gate record has maySend: false', async () => {
  mockGet.mockResolvedValue(JSON.stringify({ maySend: false, selector: 's', privateKeyEnc: 'gcm:...' }));
  /* 451/defer */
});

test('allows and attaches the decrypted per-domain key on sender:connection', async () => {
  const encoded = keyCrypto.encrypt(TEST_PEM, process.env.OUTBOUND_KEY_ENCRYPTION_SECRET);
  mockGet.mockResolvedValue(JSON.stringify({ maySend: true, selector: 'hm1', privateKeyEnc: encoded }));
  const { hooks } = setup();
  await runFetch(hooks, 'b-m1@hm-bounce.mail.example.com');
  const delivery = { envelope: { from: 'b-m1@hm-bounce.mail.example.com' }, dkim: {} };
  await runHook(hooks['sender:connection'], [delivery, {}]);
  expect(delivery.dkim.keys).toEqual([{ domainName: 'mail.example.com', keySelector: 'hm1', privateKey: TEST_PEM }]);
});

test('log:entry ACCEPTED writes a delivered event to the outbound:events stream', async () => {
  const { hooks } = setup();
  const done = jest.fn();
  hooks['log:entry']({ action: 'ACCEPTED', returnPath: 'b-m1@hm-bounce.mail.example.com', response: '250 OK' }, done);
  await flushMicrotasks();
  expect(mockXadd).toHaveBeenCalledWith('outbound:events', '*', 'type', 'delivered', 'messageId', 'm1', 'domain', 'mail.example.com', 'response', '250 OK', 'at', expect.any(String));
  expect(done).toHaveBeenCalled();
});

test('log:entry ignores QUEUED/DROP/NOQUEUE actions', async () => { /* mockXadd not called, done still called */ });

test('log:entry on an unparseable envelope logs and does not throw', async () => { /* entry.returnPath missing or malformed */ });

test('bounds the per-domain cache to MAX_CACHE_ENTRIES', async () => { /* insert > 5000 distinct domains, assert cache size never exceeds the cap — expose cache size via a test-only export or by counting mockGet calls on a repeat of the first-ever domain to prove it was evicted */ });
```

- [ ] **Step 2: Run `cd mta && npm test -- tests/plugins/hidemail-outbound.test.js` — expect FAIL**

- [ ] **Step 3: Implement the plugin changes**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Update `mta/config/zonemta.js`** per the bullet above (real MX delivery, product Redis db, HELO env var, drop fixed DKIM config).

- [ ] **Step 6: Update `mta/README.md`**: replace the M0 "spike deliver/hold proof" section's gate-key instructions (`outbound:spike:domain:*`) with the new `outbound:domain:gate:*` JSON shape, and add one paragraph stating the plugin now requires `OUTBOUND_KEY_ENCRYPTION_SECRET` to match the backend's.

- [ ] **Step 7: Leave the M0 integration test (`mta/tests/integration/deliver-and-hold.test.js`) and `mta/docker-compose.spike.yml` in place, unmodified, for local smarthost-based delivery testing** — note in the task report that production delivery (real MX, no smarthost) is proven by Task 15's compose wiring plus a manual deploy-time check, not by a new automated integration test in this plan (writing a full real-MX integration test would need a real external mailbox and is out of proportion for this task; this is a deliberate scope line, not an oversight — record it as a parked concern for the controller summary).

- [ ] **Step 8: Commit**

```bash
git add mta/plugins/hidemail-outbound.js mta/config/zonemta.js mta/tests/plugins/hidemail-outbound.test.js mta/README.md
git commit -m "$(cat <<'EOF'
feat(mta): sign with real per-domain keys and gate on product Redis
EOF
)"
```

---

### Task 13: Event consumer

**Files:**
- Create: `backend/services/outbound/eventConsumer.js`
- Modify: `backend/server.js` (start the consumer)
- Test: `backend/tests/services/outbound/eventConsumer.test.js`

**Interfaces:**
- Consumes: Task 8's `messageStore.updateStatus`; Task 11's `bounceClassifier.classifyDeliveryResponse` + `suppressionService.addSuppression`; reads the `outbound:events` stream Task 12's plugin writes to.
- Produces: `eventConsumer.consumeOnce(redisClient) -> Promise<{processed: number}>` (one `XREADGROUP` batch, used directly by tests) and `eventConsumer.start() -> () => void` (stop function; loop of `consumeOnce` on the real `redisService.client`, `setImmediate`-chained, not a tight `while(true)` spin — back off with a short delay when a batch is empty).
- **Dependency injection for testability:** accept the Redis client as a parameter (`consumeOnce(redisClient, { messageStore, bounceClassifier, suppressionService } = {})`) so unit tests pass a small hand-built fake object implementing just `xadd`/`xgroup`/`xreadgroup`/`xack` — **do not** extend the shared `backend/__mocks__/ioredis.js` mock for this (that mock is used by every other test in the backend tree; adding stream methods there is unnecessary risk for a single task's tests). Create the consumer group lazily inside `consumeOnce` (`XGROUP CREATE outbound:events backend-consumers $ MKSTREAM`, ignore the `BUSYGROUP` error when it already exists) rather than requiring separate setup.
- **Idempotent apply (binding — this is the spec 5.7 "applying an event twice must not double count" rule):** `messageStore.updateStatus` is already idempotent by construction (Task 8 — unconditional overwrite). The one place double-processing could double-count is suppression: before calling `suppressionService.addSuppression`, this consumer must not add the same email twice for the same reason — but `suppressionService.addSuppression`'s own Redis `HSET` is itself naturally idempotent (setting the same hash field to the same value twice is a no-op from the caller's perspective), so no extra de-duplication is needed here either. State this reasoning explicitly in the task report rather than adding a redundant de-dup layer — Global Constraints §"never create fallback mechanisms" applies: don't build a second idempotency mechanism on top of two already-idempotent writes.
- For each stream entry: parse fields `{type, messageId, domain, response, at}`; `messageStore.updateStatus({id: messageId, status: type, response})`; if `type === 'bounced'`, look up the message's `recipient`/`accountId` via `messageStore.getMessage(messageId)` (needed because the stream entry itself carries no recipient or accountId — only `messageId`/`domain`), classify `response` via `bounceClassifier.classifyDeliveryResponse`, and call `suppressionService.addSuppression({accountId, email: recipient, reason: 'hard_bounce'})` only when `shouldSuppress` is true; always `XACK` the entry after successful processing (and on a classification/suppression error too — log it, don't block the stream on one bad message; re-processing a stuck entry is worse than losing one suppression).

- [ ] **Step 1: Write failing tests** — a `delivered` event updates the message to `status: 'delivered'`; a `bounced` event whose response is `550 5.1.1 ...` adds a suppression entry; a `bounced` event whose response is `550 5.7.1 ...` updates status but adds no suppression (re-asserts the Review Focus rule end-to-end through the consumer, not just the classifier unit); processing the same stream entry id twice (simulate by calling `consumeOnce` twice without the producer adding anything new, or by replaying a captured entry through the handler function directly) leaves exactly one suppression entry, not two; a message with an unknown `messageId` (not in `messageStore`) is acknowledged and skipped without throwing.

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Wire `eventConsumer.start()` into `backend/server.js`**, same guarded-under-test convention as Task 6's recheck job.

- [ ] **Step 4: Commit**

```bash
git add backend/services/outbound/eventConsumer.js backend/server.js backend/tests/services/outbound/eventConsumer.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add idempotent event consumer for delivery outcomes and suppression
EOF
)"
```

---

### Task 14: Operator host script

**Files:**
- Create: `backend/scripts/outbound-admin.js`
- Test: `backend/tests/scripts/outbound-admin.test.js`

**Interfaces:**
- Consumes: Task 1's `accountService` (`createAccount`, `listAccounts`, `extendAccount`), Task 5's `domainService` (`setDailyLimit` — actually owned by Task 8's `capService.setDailyLimit`, confirm against that task's final export name before wiring) and a new `domainService.setSuspended({domain, suspended}) -> Promise<void>` (small addition to Task 5's file — read-modify-write the meta record's `suspended` field and rewrite the gate record; call this out as a one-line addition to an already-committed task, same pattern Task 5 used for Task 1 and Task 6 used for Task 5), Task 9's `accountRateLimiter.setOverride`.
- Produces: a CLI invoked as `docker compose exec backend node scripts/outbound-admin.js <command> [...args]`, matching spec 5.10's exact command surface: `account create --name <label> --days <n>` (prints the licence key once, to stdout, with a clear "copy this now" line — never logged elsewhere), `account extend --key <key> --days <n>`, `account list` (table: accountId, label, status, expiresAt), `domain limit --domain <name> --daily <n>`, `domain limit --domain <name> --unlimited`, `domain suspend --domain <name>`, `domain resume --domain <name>`, `account rate --account <id> --per-minute <n>`. Parse `process.argv` with a small hand-rolled parser (no new dependency — `--flag value` pairs after a command/subcommand word); unknown command or missing required flag prints usage to stderr and exits `1`; every successful command exits `0`.

- [ ] **Step 1: Write failing tests** — invoke the script's exported command handlers directly (export a `{commands: {...}, parseArgs, main}` object so tests don't need to spawn a child process for every case — one or two end-to-end `execFileSync` tests for the real CLI entrypoint are enough to prove the argv wiring, the rest test the handler functions directly): `account create` returns the printed key format; `domain limit --domain x --unlimited` results in `capService.getDailyLimit('x')` being `null` afterward; an unknown command exits non-zero with a usage message; `account rate` without `--per-minute` exits non-zero without touching Redis.

- [ ] **Step 2: Run — expect FAIL, implement, expect PASS**

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/outbound-admin.js backend/services/outbound/domainService.js backend/tests/scripts/outbound-admin.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add operator host script for accounts, caps, and suspension
EOF
)"
```

---

### Task 15: Production compose, env, CI, docs

**Files:**
- Modify: `docker-compose.yml` (add permanent `zonemta` and `mongo` services, outside any profile; add the new backend env vars)
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml` (build/test/push an `mta` image alongside `frontend`/`backend`)
- Modify: `.github/workflows/security-audit.yml` (add an `mta/` `npm audit --audit-level=high` step)
- Modify: `.cursor/rules/dependencies.mdc` (if the audit-step addition changes anything the rule currently describes as "not yet in CI")
- Modify: `mta/README.md` (production deployment paragraph)
- Modify: `README.md` (short outbound-send section, mirroring how other paid APIs are documented there)
- Modify: `docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md` (mark M1 done, point at M2 — the next plan file does not exist yet; link the spec section instead)

**Interfaces:** None — this task wires together every earlier task's env vars and runtime services. It has no tests of its own; its "test" is the verification steps below.

- [ ] **Step 1: Add `zonemta` and `mongo` services to `docker-compose.yml`**, modeled on `mta/docker-compose.spike.yml` but permanent and production-shaped: `mongo` on the `internal` network only, a named volume (`mongo-data`, not `mongo-spike-data`); `zonemta` built from `./mta`, networks `internal` **and** `default` (it must reach real recipient MX servers on the public internet, same reasoning the existing `postfix` service already documents in this file for the same requirement), feeder SMTP port (2526) **not published** to the host at all (internal-network-only per spec 5.6 — stricter than the spike, which published it loopback-only for host-side testing), API port published `127.0.0.1:12080:12080` only (mirrors the existing backend `127.0.0.1:9001:9001` pattern already in this file); env: `MONGO_URL=mongodb://mongo:27017/zone-mta`, `PLUGIN_REDIS_URL=redis://redis:6379/0` (confirm this matches whatever Task 12 ultimately wired — see that task's note), `OUTBOUND_KEY_ENCRYPTION_SECRET=${OUTBOUND_KEY_ENCRYPTION_SECRET}`, `OUTBOUND_HELO_HOSTNAME=${OUTBOUND_HELO_HOSTNAME:-mail.hide-mail.org}`. Add the same `OUTBOUND_*` env vars this plan introduced (`OUTBOUND_KEY_ENCRYPTION_SECRET`, `OUTBOUND_DAILY_LIMIT_DEFAULT`, `OUTBOUND_RATE_PER_MINUTE`, `OUTBOUND_MAX_MESSAGE_BYTES`, `OUTBOUND_MESSAGE_RETENTION_DAYS`, `OUTBOUND_IDEMPOTENCY_TTL_SECONDS`, `OUTBOUND_DNS_RECHECK_SECONDS`, `OUTBOUND_RETURN_PATH_TARGET`, `OUTBOUND_HELO_HOSTNAME`, `ZONEMTA_SMTP_HOST`, `ZONEMTA_SMTP_PORT`) to the `backend` service's `environment:` block, each with the same default-via-`${VAR:-default}` style already used throughout this file.

- [ ] **Step 2: Add the same variables to `.env.example`** with one-line comments, following the file's existing section-header convention (add an `# Outbound Send (hm-send)` section near the bottom, not scattered).

- [ ] **Step 3: Add an `mta` build/push job to `.github/workflows/ci.yml`**, copied from the existing `backend` job's shape (test job first on Node 24, then build-and-push using `./mta` as context with the Node-22-pinned `Dockerfile` already in that directory — the Dockerfile's own `FROM node:22-...` is unaffected by whatever Node version the CI runner's own steps use to `npm ci`/`npm test` in `mta/` beforehand, consistent with M0's host-tooling-vs-runtime distinction already documented in `mta/README.md`). Image name: `${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/mta`.

- [ ] **Step 4: Add an `mta/` audit step to `.github/workflows/security-audit.yml`**, same pattern as the existing `backend-audit` step (`working-directory: mta`, `continue-on-error: true`, same id-naming convention), and include its outcome in the failure-notification issue body table.

- [ ] **Step 5: Reconcile `.cursor/rules/dependencies.mdc`** — it already documents the `mta/` audit tolerance from M0; add a one-line note that CI now runs this automatically (weekly + whatever `ci.yml`'s own trigger is) rather than requiring a manual `(cd mta && npm audit ...)` run, if that's not already implied.

- [ ] **Step 6: Update `mta/README.md`'s production section** — one paragraph: real MX delivery (no smarthost in production config), the shared `OUTBOUND_KEY_ENCRYPTION_SECRET` requirement, and a pointer to `docker-compose.yml`'s new permanent services (the spike section above it stays, for local dev against a fake receiver).

- [ ] **Step 7: Update `README.md`** with a short "Outbound Send (`outbound` licence)" paragraph next to the other paid-API sections, linking the spec and this plan.

- [ ] **Step 8: Update `docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md`** — mark the M1 row's status, and its "For agentic workers" note, as done; the M2 row stays `2026-11-17-outbound-send-m2-metrics.md` (not yet written — this plan does not write it, per the roadmap's own stated order).

- [ ] **Step 9: Verify** — `cd mta && npm audit --audit-level=high` exits 0 (unchanged from M0, confirming Task 12 didn't regress it); `docker compose config` (no `--profile`) parses the modified `docker-compose.yml` without error and lists `zonemta`/`mongo` among the services that would start; `cd backend && npm test` and `cd mta && npm test` both pass in full (whole-tree regression check, not just this task's own files).

- [ ] **Step 10: Commit**

```bash
git add docker-compose.yml .env.example .github/workflows/ci.yml .github/workflows/security-audit.yml .cursor/rules/dependencies.mdc mta/README.md README.md docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md
git commit -m "$(cat <<'EOF'
chore(outbound): wire ZoneMTA into production compose, CI, and docs
EOF
)"
```
