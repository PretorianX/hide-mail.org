# Outbound Send M0 — ZoneMTA Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove ZoneMTA can live in this repo under the security audit gate, deliver a signed message to a local receiver, and hold a message when the domain may not send — before any product API is built.

**Architecture:** A new `mta/` package pins `zone-mta@3.10.3` with npm overrides, runs beside Redis and MongoDB in Compose, and loads one spike plugin that reads a Redis key for domain sendability and attaches a test DKIM key. A Jest integration test drives SMTP into ZoneMTA and asserts on a local `smtp-server` receiver.

**Tech Stack:** Node 24, `zone-mta@3.10.3`, MongoDB, Redis, Jest, `smtp-server`, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-17-outbound-send-design.md` (sections 3, 5.6, 6 milestone 0, 10.4)

## Global Constraints

- Work only in the `feat/send-service` worktree at `/Users/andreymartynyuk/Personal/hide-mail-send` (or its git worktree path). Never edit `/Users/andreymartynyuk/Personal/hide-mail.org`.
- Do not edit `changelog.md`.
- `mta/` is a new dependency tree: `npm audit --audit-level=high` in `mta/` must exit 0.
- The two moderate `request` / `zone-mta→request` advisories may remain; every other advisory at any severity fails the spike.
- Record the `request` tolerance in `.cursor/rules/dependencies.mdc` (and leave a note for the security-maintainer skill). Do not dismiss GitHub Dependabot alerts in this plan — that is an operator step after merge, documented in the spike report.
- Conventional commits; TDD for plugin unit tests; the delivery proof is an integration test that may use Docker.
- No product API, no portal, no licence types, no Grafana in this plan.
- If delivery or hold fails under the overrides that pass the audit, stop with `BLOCKED` and a spike report — do not invent a second MTA.

## Review Focus

- Override majors that silence audit but break SMTP submission or DKIM signing at runtime.
- Hold path that rejects (permanent) instead of deferring (temporary), so mail never retries after resume.
- Spike plugin that talks to Redis on every `sender:fetch` with no cache and stalls the sender under load (spike may use a short TTL cache; note the choice).
- Compose that publishes ZoneMTA's SMTP port on the public interface instead of loopback / internal only.
- Leaving `request` unmentioned in `dependencies.mdc`, so the next security pass treats the alerts as unexplained failures.

---

### Task 1: Scaffold `mta/` package and audit-clean lockfile

**Files:**
- Create: `mta/package.json`
- Create: `mta/package-lock.json` (via `npm install`)
- Create: `mta/.gitignore` (`node_modules/`, coverage, logs)
- Create: `mta/README.md` (one paragraph: spike tree for ZoneMTA; how to audit)
- Modify: `.cursor/rules/dependencies.mdc` (add `mta/` tree + `request` tolerance)
- Modify: `.gitignore` (ignore `mta/node_modules` if not already covered by `node_modules/`)

**Interfaces:**
- Consumes: nothing from later tasks
- Produces: `mta/package.json` with `"dependencies": { "zone-mta": "3.10.3" }` and an `overrides` block; `npm audit --audit-level=high` exits 0 in `mta/`

- [ ] **Step 1: Write `mta/package.json`**

```json
{
  "name": "hidemail-mta",
  "version": "0.0.0",
  "private": true,
  "engines": { "node": ">=24.0.0" },
  "dependencies": { "zone-mta": "3.10.3" },
  "overrides": {}
}
```

Fill `overrides` with the smallest set that makes the audit pass. Start from the probe that cleared high/critical: `nodemailer`, `smtp-server`, `undici`, `js-yaml`, `restify`, `mailauth`, `find-my-way`, `uuid` (`^11.1.1` only — never 12+), `joi`, `fast-xml-parser`, `toml`, `form-data`, `qs`, `tough-cookie`, `send`. Drop any override that is not required for `npm audit --audit-level=high` to pass.

- [ ] **Step 2: Install and audit**

Run:
```bash
cd mta && npm install && npm audit --audit-level=high
```
Expected: install succeeds; audit exits 0. `npm audit --json` may still list moderate `request` / `zone-mta`.

- [ ] **Step 3: Record the tolerance in `.cursor/rules/dependencies.mdc`**

Add bullets:
- `mta/` is a third dependency tree; audit it with `(cd mta && npm audit --audit-level=high)`.
- Tolerated while ZoneMTA is used: open Dependabot alerts for `request` and for `zone-mta` solely because it depends on `request`, dismissed with reason "no patched version; ZoneMTA reaches `request` only for HTTP-upload delivery, which is not configured". Any other open alert fails the gate.

- [ ] **Step 4: Commit**

```bash
git add mta/package.json mta/package-lock.json mta/.gitignore mta/README.md .cursor/rules/dependencies.mdc
git commit -m "$(cat <<'EOF'
chore(mta): scaffold ZoneMTA tree under audit overrides

EOF
)"
```

---

### Task 2: Spike plugin — hold when domain may not send

**Files:**
- Create: `mta/plugins/hidemail-outbound.js`
- Create: `mta/tests/plugins/hidemail-outbound.test.js`
- Create: `mta/jest.config.js`
- Modify: `mta/package.json` (devDeps: `jest`, scripts `test`)

**Interfaces:**
- Consumes: Redis key `outbound:spike:domain:<domain>` value `"1"` means may send, missing/`"0"` means hold
- Produces: plugin module exporting `title` and `init(app, done)`; on `sender:fetch`, if domain may not send, calls next/throws with a temporary SMTP response (`responseCode` in 400–499 range that ZoneMTA treats as defer — use `451` and message `Domain held`); on `sender:connection`, attaches `delivery.dkim.keys` from `app.config.dkim` when present

- [ ] **Step 1: Write the failing unit tests**

```js
test('holds when redis key missing', async () => { /* expect responseCode 451 */ });
test('holds when redis key is 0', async () => { /* expect responseCode 451 */ });
test('allows when redis key is 1', async () => { /* expect next/resolve without error */ });
test('attaches dkim key from config on sender:connection', async () => { /* delivery.dkim.keys has domainName + keySelector + privateKey */ });
```

Inject a fake Redis client and a fake `app` with `addHook` collecting handlers. Domain for the test message: `mail.example.com` (from `delivery.envelope.from` = `a@mail.example.com`).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd mta && npm test -- tests/plugins/hidemail-outbound.test.js`
Expected: FAIL (module or handlers missing)

- [ ] **Step 3: Implement `mta/plugins/hidemail-outbound.js`**

`init` registers `sender:fetch` and `sender:connection`. Redis URL from `app.config.redis` or `process.env.REDIS_URL` default `redis://127.0.0.1:6379/3`. DKIM from `app.config.dkim`: `{ domainName, keySelector, privateKey }`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd mta && npm test -- tests/plugins/hidemail-outbound.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mta/plugins/hidemail-outbound.js mta/tests mta/jest.config.js mta/package.json mta/package-lock.json
git commit -m "$(cat <<'EOF'
feat(mta): spike plugin holds undeliverable domains

EOF
)"
```

---

### Task 3: ZoneMTA config, Compose services, local receiver proof

**Files:**
- Create: `mta/config/zonemta.js` (or `.toml` if required — prefer JS matching ZoneMTA's `default.js` shape)
- Create: `mta/Dockerfile`
- Create: `mta/scripts/generate-spike-dkim.js` (writes `mta/testdata/dkim.pem` + prints public `p=`)
- Create: `mta/testdata/.gitignore` (ignore `dkim.pem`)
- Create: `mta/tests/integration/deliver-and-hold.test.js`
- Create: `mta/docker-compose.spike.yml` (mongo, redis for MTA db, zonemta, optional — or extend root compose with a profile `spike`)
- Modify: `docker-compose.yml` only if adding a `profiles: [spike]` service block keeps default `docker compose up` unchanged

**Interfaces:**
- Consumes: plugin from Task 2; lockfile from Task 1
- Produces: ZoneMTA feeder SMTP on `127.0.0.1:2526` (not 25); API metrics on `127.0.0.1:12080`; integration test that (1) delivers when Redis key is `1` and asserts DKIM-Signature on the received message, (2) does not open an MX connection when key is `0` (assert via deferred state / no message on receiver within timeout)

- [ ] **Step 1: Generate a test DKIM key (not committed)**

Run: `node mta/scripts/generate-spike-dkim.js`
Expected: `mta/testdata/dkim.pem` exists; script prints selector `spike` and domain `mail.example.com`.

- [ ] **Step 2: Write ZoneMTA config loading the plugin**

Minimal: mongo + redis to Compose services, one zone `default`, feeder interface `127.0.0.1:2526` without auth, plugins: `core/default-headers`, `hidemail-outbound` with dkim config pointing at the pem. Disable unused core plugins (clamav, rspamd, http-auth, …).

- [ ] **Step 3: Write the failing integration test**

```js
test('delivers signed mail when domain may send', async () => { /* set redis key 1; SMTP submit; receiver gets mail with DKIM-Signature */ });
test('defers without delivery attempt when domain held', async () => { /* set redis key 0; SMTP submit; receiver gets nothing; ZoneMTA queue shows deferred / plugin held */ });
```

Skip with a clear message if Compose services are not up (`ZONEMTA_SPIKE=1` env to enable).

- [ ] **Step 4: Bring up spike dependencies and run integration tests**

Run:
```bash
docker compose -f docker-compose.yml -f mta/docker-compose.spike.yml --profile spike up -d --build
ZONEMTA_SPIKE=1 npm test --prefix mta -- tests/integration/deliver-and-hold.test.js
```
Expected: both tests PASS. If FAIL because overrides broke ZoneMTA, write `docs/superpowers/specs/2026-11-17-outbound-send-m0-spike-report.md` with the failure, commit the report, and stop the plan as BLOCKED — do not loosen the audit gate.

- [ ] **Step 5: Document how to re-run the spike in `mta/README.md`**

Include audit command, compose command, test command, and the `request` dismissal wording for Dependabot after merge.

- [ ] **Step 6: Commit**

```bash
git add mta docker-compose.yml
git commit -m "$(cat <<'EOF'
test(mta): prove ZoneMTA delivers and holds under audit overrides

EOF
)"
```

---

### Task 4: Spike gate report

**Files:**
- Create: `docs/superpowers/specs/2026-11-17-outbound-send-m0-spike-report.md`

**Interfaces:**
- Consumes: audit output, integration test results from Tasks 1–3
- Produces: a short report with PASS or FAIL; if PASS, green-light for writing M1 plan; if FAIL, product-owner stop

- [ ] **Step 1: Write the report**

Include: ZoneMTA version; override list; `npm audit --audit-level=high` exit code; remaining moderate advisories; deliver test result; hold test result; PASS/FAIL verdict; next action (`write M1 plan` or `reconsider ZoneMTA`).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-11-17-outbound-send-m0-spike-report.md
git commit -m "$(cat <<'EOF'
docs(mta): record ZoneMTA spike gate result

EOF
)"
```
