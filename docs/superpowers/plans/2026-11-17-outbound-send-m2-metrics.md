# Outbound Send M2 — Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Hide Mail Send metrics: Redis-backed series from spec §5.8, a customer Prometheus scrape at `GET /api/outbound/metrics` authenticated with `hm_metrics_...`, the same series on the operator `:9001/metrics` surface with an `account` label, metrics-token issue/rotate API (backend only), plus Grafana dashboard and alert rules.

**Architecture:** A small `outboundMetricsStore` owns Redis counters/gauges; send path, event consumer and DNS recheck write into it. A renderer builds Prometheus text from Redis (so redeploys never zero the series). Customer scrape uses a dedicated Registry with domain-only labels; the existing `metricsService` `:9001` server registers the same series plus `account` and operator-only extras via prom-client `collect()` hooks. Metrics tokens mirror send-key hashing (SHA-256, shown once) but are one rotatable token per account.

**Tech Stack:** Node 24+ (backend), ioredis, prom-client (already in backend), Express 5, Jest, Grafana dashboard JSON + Prometheus rule YAML. No new runtime dependencies. `mta/` untouched (Node 22 + patch-package preserved).

**Spec:** `docs/superpowers/specs/2026-11-17-outbound-send-design.md` (sections 5.2 metrics token, 5.8, 6 milestone 2)

**Also read:**
- `.superpowers/sdd/m1-controller-summary.md` — M1 PASS record; event consumer has no metrics yet.
- `backend/services/metricsService.js`, `backend/services/billingMetricsCollector.js` — existing prom patterns.
- `backend/services/outbound/sendKeyService.js` — credential hashing pattern to mirror.
- `grafana/hidemail-dashboard.json` — dashboard JSON shape to mirror (new file, do not edit the existing overview).

## Global Constraints

- Work only in `/Users/andreymartynyuk/Personal/hide-mail-send` on `feat/send-service`. Never edit `/Users/andreymartynyuk/Personal/hide-mail.org`. No push. Do not edit `changelog.md`.
- Do not start M3/M4. No portal UI.
- `mta/` Docker runtime stays `node:22-bookworm-slim`; do not touch `mta/package.json`, lockfile, or `patches/`. Report "mta tree untouched" in the task report when true.
- `backend/`: `npm audit --audit-level=high` must stay exit 0. Add no new runtime dependency unless a task says otherwise (prom-client is already present).
- Counts live in Redis and are **rendered** from Redis on scrape — never rely on in-process Counter state surviving a redeploy. Use Gauge (or a custom collector that `set`s from Redis) even for series named `*_total`.
- Series names and labels in the customer scrape must match spec §5.8 exactly. Operator `:9001` uses the **same** series names with an added `account` label, plus the operator-only extras listed in Task 5.
- Customer scrape: `GET /api/outbound/metrics` with `Authorization: Bearer hm_metrics_...` only — never accept `X-License-Key` or a send key on this path.
- Metrics token (`hm_metrics_...`): one per account, rotatable, read-only, SHA-256 stored, raw shown once. Management endpoints use `X-License-Key` + `requireOutboundLicense` (same as send-keys).
- Rejected-series reasons are exactly: `invalid_recipient`, `suppressed`, `daily_limit`, `rate_limit`, `domain_not_verified`, `domain_suspended`. Do not invent reasons for `413` / `503` (those are not in §5.8).
- Bounce categories are exactly: `unknown_recipient`, `mailbox`, `policy`, `reputation`, `held`, `other`.
- Event application must not double-count: terminal events (`delivered`/`bounced`) increment at most once per message; attempt events (`deferred`/`held`) increment once per distinct stream entry id (SET NX on the stream id).
- Uncapped domains (`dailyLimit: null`) still emit `daily_sent` and set `daily_limit` to `+Inf`.
- Out of scope: portal UI / scrape_config page (M4 shows token in UI — this plan's GET returns the scrape_config JSON for the portal later), bounce mail-back (M3), mta changes.

## Review Focus

- **Redeploy must not reset customer counters to zero.** Pin: Task 1 writes accepted=5 into Redis, constructs a fresh renderer (simulating a new process), scrapes, asserts `hidemail_outbound_accepted_total{domain="…"} 5`.
- **Metrics token must not authenticate the Send API, and a send key must not scrape metrics.** Pin: Task 3/4 tests — `hm_metrics_...` on `POST /messages` → 401; `hm_send_...` on `GET /metrics` → 401.
- **Replaying a delivered event must not double `delivered_total`.** Pin: Task 2 feeds the same delivered event twice through the consumer handler and asserts the Redis delivered counter stays at 1.
- **Customer scrape must never leak another account's domain.** Pin: Task 4 creates two accounts with domains, scrapes with account A's token, asserts B's domain series are absent.
- **Operator series include `account` and still match the Redis value the customer sees.** Pin: Task 5 asserts the same domain's accepted value equals on both surfaces (customer text vs operator registry), with operator carrying `account="<id>"`.

---

### Task 1: Redis metrics store + Prometheus text renderer

**Files:**
- Create: `backend/services/outbound/outboundMetricsStore.js`
- Create: `backend/services/outbound/outboundMetricsRenderer.js`
- Test: `backend/tests/services/outbound/outboundMetricsStore.test.js`
- Test: `backend/tests/services/outbound/outboundMetricsRenderer.test.js`

**Interfaces:**
- Consumes: `redisService.client`, `capService.peekCounter`, `domainService.getDomainMeta` / account domain list, `suppressionService` (or direct HGETALL of `outbound:suppression:<accountId>`).
- Produces:
  - Redis keys:
    - `outbound:metrics:c:<domain>:accepted` — integer string via INCR
    - `outbound:metrics:c:<domain>:delivered`
    - `outbound:metrics:c:<domain>:deferred`
    - `outbound:metrics:c:<domain>:held`
    - `outbound:metrics:c:<domain>:bounced:<category>`
    - `outbound:metrics:c:<domain>:rejected:<reason>`
    - `outbound:metrics:queued:<domain>` — integer via INCR/DECR (never below 0)
    - `outbound:metrics:dns:<domain>:<outcome>` — `pass`|`fail`|`no_answer` (operator feed)
    - `outbound:metrics:applied:<streamId>` — `SET` value `1` with TTL 30 days (idempotency for attempt events)
    - `outbound:metrics:terminal:<messageId>` — `SET` value `<type>` NX (idempotency for delivered/bounced)
  - `outboundMetricsStore.incrAccepted(domain) -> Promise<void>` (+1 accepted, +1 queued)
  - `outboundMetricsStore.incrRejected(domain, reason) -> Promise<void>`
  - `outboundMetricsStore.incrDeferred(domain, streamId) -> Promise<boolean>` — false if streamId already applied
  - `outboundMetricsStore.incrHeld(domain, streamId) -> Promise<boolean>`
  - `outboundMetricsStore.incrDelivered(domain, messageId) -> Promise<boolean>` — false if terminal already set; on true also DECR queued
  - `outboundMetricsStore.incrBounced(domain, messageId, category) -> Promise<boolean>` — same terminal gate; DECR queued
  - `outboundMetricsStore.incrDnsOutcome(domain, outcome) -> Promise<void>` — outcome ∈ `pass|fail|no_answer`
  - `outboundMetricsStore.readCounters(domain) -> Promise<{accepted,delivered,deferred,held,bounced:Record,rejected:Record,queued}>`
  - `outboundMetricsRenderer.renderAccount({ accountId, accountLabel?: boolean }) -> Promise<string>` — Prometheus text exposition for that account's domains. When `accountLabel` is false/omitted (customer): labels are exactly those in §5.8. When true (operator reuse helper): add `account="<accountId>"`. Gauges: `suppressions{reason}`, `daily_sent`, `daily_limit` (`+Inf` if null), `domain_verified` (1/0), `queued`.

- [ ] **Step 1: Write failing store tests** covering incrAccepted→queued=1, incrDelivered decrements queued and is idempotent on second call with same messageId, incrDeferred is idempotent on same streamId, incrRejected with each allowed reason, readCounters shape.

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest tests/services/outbound/outboundMetricsStore.test.js`)

- [ ] **Step 3: Implement `outboundMetricsStore.js`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Write failing renderer tests** — seed Redis for domain `mail.example.com` owned by account A (accepted=5, delivered=3, bounced unknown_recipient=1, rejected suppressed=2, queued=1, dailyLimit=1000, verified, two suppressions hard_bounce); assert rendered text contains the exact series names and label sets from §5.8 and the value `5` for accepted (Review Focus redeploy pin: call renderer twice / construct twice). Assert `daily_limit` is `+Inf` when meta.dailyLimit is null.

- [ ] **Step 6: Implement `outboundMetricsRenderer.js`**, run — expect PASS

- [ ] **Step 7: Commit**

```bash
git add backend/services/outbound/outboundMetricsStore.js backend/services/outbound/outboundMetricsRenderer.js backend/tests/services/outbound/outboundMetricsStore.test.js backend/tests/services/outbound/outboundMetricsRenderer.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add Redis-backed outbound metrics store and renderer
EOF
)"
```

---

### Task 2: Instrument send path, event consumer, and DNS recheck

**Files:**
- Modify: `backend/services/outbound/sendService.js`
- Modify: `backend/controllers/outbound/messagesController.js` (map SendError → rejected reason before respond, or instrument inside sendService catch paths)
- Modify: `backend/services/outbound/eventConsumer.js`
- Modify: `backend/services/outbound/dnsRecheckJob.js` (and/or `domainService.checkDomain` call site)
- Modify: `backend/services/outbound/bounceClassifier.js` only if a `reputation` category mapping is missing and needed for bounced{category="reputation"}
- Test: `backend/tests/services/outbound/sendService.metrics.test.js` (or extend existing send/messages tests)
- Test: `backend/tests/services/outbound/eventConsumer.test.js` (extend)
- Test: `backend/tests/services/outbound/dnsRecheckJob.test.js` (extend)

**Interfaces:**
- Consumes: Task 1 store; existing `bounceClassifier.classifyDeliveryResponse` → `.category`
- Produces: live increments on the real paths. Rejected reason map from `SendError.code`:
  - `RATE_LIMITED` → `rate_limit`
  - `DOMAIN_NOT_VERIFIED` → `domain_not_verified`
  - `DOMAIN_SUSPENDED` → `domain_suspended`
  - `INVALID_RECIPIENT` → `invalid_recipient`
  - `RECIPIENT_SUPPRESSED` → `suppressed`
  - `DAILY_LIMIT_REACHED` → `daily_limit`
  - (do **not** incrRejected for `MESSAGE_TOO_LARGE` / `ZONEMTA_UNAVAILABLE`)
- For `RATE_LIMITED` before a parseable From domain: use domain label `_unknown`.
- Event consumer: pass stream entry id into the handler; on `delivered`/`bounced`/`deferred`/`held` call the matching store method; on bounce use classifier category (default `other`).
- DNS recheck: after each domain check, for each record in the result call `incrDnsOutcome(domain, outcome)` where outcome is `pass` if record.status===`pass`, `no_answer` if reason===`no_answer`, else `fail`.

- [ ] **Step 1: Write failing tests** — successful send increments accepted+queued; each rejection code increments the mapped reason; 503 does not incr accepted or rejected; delivered twice → delivered stays 1 (Review Focus); deferred twice with same streamId → deferred stays 1; two deferred with different streamIds → 2; DNS recheck with no_answer increments dns no_answer.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Wire instrumentation** (inject `metricsStore` via the same overrides pattern sendService already uses; default to real store)

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/services/outbound/sendService.js backend/controllers/outbound/messagesController.js backend/services/outbound/eventConsumer.js backend/services/outbound/dnsRecheckJob.js backend/services/outbound/bounceClassifier.js backend/tests/services/outbound/
git commit -m "$(cat <<'EOF'
feat(outbound): instrument send, events, and DNS for metrics counters
EOF
)"
```

---

### Task 3: Metrics token service, auth middleware, management API

**Files:**
- Create: `backend/services/outbound/metricsTokenService.js`
- Modify: `backend/middleware/outboundAuth.js` — add `requireMetricsToken`
- Create: `backend/controllers/outbound/metricsTokenController.js`
- Create: `backend/routes/outbound/metricsToken.js`
- Modify: `backend/routes/outbound/index.js` — mount `/metrics-token`
- Modify: `backend/services/openApiSpec.js` — document POST/GET `/api/outbound/metrics-token`
- Test: `backend/tests/services/outbound/metricsTokenService.test.js`
- Test: `backend/tests/controllers/outbound/metricsTokenController.test.js`
- Test: `backend/tests/middleware/outboundAuth.metricsToken.test.js`

**Interfaces:**
- Redis:
  - `outbound:metricstoken:<sha256hex>` → JSON `{ accountId, createdAt }`, TTL = licence remaining seconds
  - `outbound:account:<accountId>:metricsToken` → sha256 hex of current token (so rotate can delete the old hash)
- Produces:
  - `metricsTokenService.rotateMetricsToken({ accountId }) -> Promise<{ key, createdAt, scrapeConfig }>` — generates `hm_metrics_${crypto.randomBytes(24).toString('hex')}`, stores hash, deletes previous hash if any, returns raw once. `scrapeConfig` is a ready-to-paste object:
    ```js
    {
      job_name: 'hidemail-outbound',
      metrics_path: '/api/outbound/metrics',
      scheme: 'https',
      static_configs: [{ targets: ['hide-mail.org'] }],
      authorization: { type: 'Bearer', credentials: '<raw key once>' }
    }
    ```
    On GET (no raw): `authorization.credentials` is `"<rotate to reveal>"` or omit credentials and include `bearerTokenHeader: 'Authorization: Bearer <token>'` note — prefer returning `scrapeConfig` without the secret and a `tokenPresent: true` flag; POST returns the secret in `key` and embeds it in `scrapeConfig.authorization.credentials`.
  - `metricsTokenService.getMetricsTokenMeta({ accountId }) -> Promise<null | { createdAt, maskedKey, scrapeConfig }>` — no raw key
  - `metricsTokenService.validateMetricsToken(raw) -> Promise<null | { accountId }>`
  - `requireMetricsToken(req,res,next)` — Bearer `hm_metrics_...` only; sets `req.accountId`; 401 on missing/invalid; also 403 if licence inactive (same live check as `requireSendKey`)

- [ ] **Step 1: Write failing service + middleware + controller tests** (rotate returns `hm_metrics_` key; second rotate invalidates first; GET masks; requireMetricsToken rejects send keys and licence keys — Review Focus)

- [ ] **Step 2: Implement service, middleware, controller, route, OpenAPI**

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add backend/services/outbound/metricsTokenService.js backend/middleware/outboundAuth.js backend/controllers/outbound/metricsTokenController.js backend/routes/outbound/metricsToken.js backend/routes/outbound/index.js backend/services/openApiSpec.js backend/tests/services/outbound/metricsTokenService.test.js backend/tests/controllers/outbound/metricsTokenController.test.js backend/tests/middleware/outboundAuth.metricsToken.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add rotatable hm_metrics token and management API
EOF
)"
```

---

### Task 4: Customer scrape endpoint

**Files:**
- Create: `backend/controllers/outbound/metricsScrapeController.js`
- Create: `backend/routes/outbound/metrics.js`
- Modify: `backend/routes/outbound/index.js` — mount `GET /metrics` **before** any licence middleware (this path uses `requireMetricsToken` only)
- Modify: `backend/services/openApiSpec.js` — `GET /api/outbound/metrics`
- Test: `backend/tests/controllers/outbound/metricsScrapeController.test.js`

**Interfaces:**
- `GET /api/outbound/metrics` → `200` with `Content-Type: text/plain; version=0.0.4; charset=utf-8` (prom-client's `contentType`) and body = `outboundMetricsRenderer.renderAccount({ accountId: req.accountId })` (no `account` label).
- Cross-account isolation test (Review Focus): account B's domain must not appear in account A's scrape.
- Send-key on this route → 401.

- [ ] **Step 1: Write failing controller tests**

- [ ] **Step 2: Implement route + controller + OpenAPI**

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add backend/controllers/outbound/metricsScrapeController.js backend/routes/outbound/metrics.js backend/routes/outbound/index.js backend/services/openApiSpec.js backend/tests/controllers/outbound/metricsScrapeController.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add customer Prometheus scrape at /api/outbound/metrics
EOF
)"
```

---

### Task 5: Operator series on `:9001/metrics`

**Files:**
- Create: `backend/services/outbound/outboundOperatorMetrics.js`
- Create: `backend/services/outbound/operatorDnsHealth.js`
- Modify: `backend/services/metricsService.js` — register/export operator outbound metrics (or call `outboundOperatorMetrics.register(client)` from server startup / module load)
- Modify: `backend/server.js` — ensure registration happens with metrics server (no second listen port)
- Test: `backend/tests/services/outbound/outboundOperatorMetrics.test.js`
- Test: `backend/tests/services/outbound/operatorDnsHealth.test.js`

**Interfaces:**
- On each `:9001/metrics` collect, for every domain in `outbound:domains:index`:
  - Emit all §5.8 series with labels including `account="<accountId>"` (from domain meta) plus `domain`.
  - `hidemail_outbound_suppressions` also gets `account`.
- Operator-only extras (exact names):
  - `hidemail_outbound_dns_check_total{domain,outcome,account}` — from Redis dns counters
  - `hidemail_outbound_event_consumer_lag` — gauge: `XLEN outbound:events` minus acknowledged, or simpler: count of pending entries via `XPENDING outbound:events backend-consumers` total; if group missing, report `0`
  - `hidemail_outbound_operator_dns_ok{check}` — gauge 1/0 for checks: `return_path_mx`, `return_path_spf`, `helo_a` (resolve `OUTBOUND_RETURN_PATH_TARGET` MX+TXT SPF and `OUTBOUND_HELO_HOSTNAME` A/AAAA). Cache result in Redis key `outbound:metrics:operator-dns` JSON with `checkedAt`, refresh at most every `OUTBOUND_DNS_RECHECK_SECONDS`.
- Review Focus pin: same accepted value on customer render and operator collect for one domain.
- Implementation note: use prom-client `Gauge` with `async collect()` that resets and `set`s from Redis (mirrors "rendered from Redis"). Do not use Counter.inc in-process for these series.

- [ ] **Step 1: Write failing tests** for operator registry output and operatorDnsHealth (mock resolver)

- [ ] **Step 2: Implement + wire into metricsService/server**

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add backend/services/outbound/outboundOperatorMetrics.js backend/services/outbound/operatorDnsHealth.js backend/services/metricsService.js backend/server.js backend/tests/services/outbound/outboundOperatorMetrics.test.js backend/tests/services/outbound/operatorDnsHealth.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): expose operator outbound series on :9001/metrics
EOF
)"
```

---

### Task 6: Grafana outbound dashboard

**Files:**
- Create: `grafana/hidemail-outbound-dashboard.json`
- Test: `backend/tests/grafana/hidemailOutboundDashboard.test.js` (or `scripts/`-adjacent — prefer `backend/tests/grafana/` so `npm test` picks it up if jest roots include it; otherwise a tiny node assert script run from the test file)

**Interfaces:**
- Dashboard uid `hidemail-outbound`, title `Hide Mail - Outbound Send`.
- Templating: `datasource`, `account` (label_values on `hidemail_outbound_accepted_total`), `domain` (label_values filtered by account).
- Panels (one job each; Prometheus queries use the operator series with `account`+`domain`):
  1. Accepted / delivered / deferred / bounced rates (timeseries)
  2. Delivery rate `rate(delivered)/rate(accepted)` (gauge or timeseries)
  3. Bounce rate by category (timeseries stacked)
  4. Cap usage: `daily_sent / daily_limit` (gauge; handle `+Inf`)
  5. Suppression growth by reason (timeseries)
  6. Queue depth `queued` (timeseries)
  7. DNS state `domain_verified` + dns_check outcomes (stat/timeseries)
  8. Event consumer lag + operator DNS ok (stat)
- Mirror structural conventions from `grafana/hidemail-dashboard.json` (`__inputs`, `__requires`, schemaVersion 39, refresh 30s).
- Test: JSON parses; uid/title match; every §5.8 series name appears in at least one panel expr; `account` and `domain` template variables exist.

- [ ] **Step 1: Write failing test that loads the JSON path and asserts the properties above (file missing → fail)**

- [ ] **Step 2: Author the dashboard JSON**

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add grafana/hidemail-outbound-dashboard.json backend/tests/grafana/hidemailOutboundDashboard.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add Grafana outbound Send dashboard
EOF
)"
```

---

### Task 7: Grafana / Prometheus alert rules

**Files:**
- Create: `grafana/hidemail-outbound-alerts.yml`
- Test: `backend/tests/grafana/hidemailOutboundAlerts.test.js`

**Interfaces:**
- Prometheus rule file (`groups:` → `name: hidemail-outbound` → `rules:`).
- Named thresholds at the top of the file as YAML anchors (or a `thresholds:` comment block whose values are copied verbatim into every `expr` — prefer YAML anchors):

```yaml
# Thresholds (edit here only)
# bounce_rate: 0.05
# bounce_volume_floor: 20
# deferral_rate: 0.20
# volume_spike_factor: 3
# volume_spike_floor: 50
# suppression_per_hour: 10
# queue_depth: 500
# queue_age_seconds: 3600   # informational — age needs a separate series; if not emitted, alert on depth only
# cap_usage: 0.90
```

- Rules (per domain where applicable; must fire for capped **and** uncapped):
  1. `OutboundBounceRateHigh` — `sum(rate(hidemail_outbound_bounced_total[1h])) by (domain, account) / sum(rate(hidemail_outbound_accepted_total[1h])) by (domain, account) > 0.05` **and** accepted volume floor over 1h ≥ 20
  2. `OutboundDeferralRateHigh` — deferred/accepted > 0.20 over 30m
  3. `OutboundVolumeSpike` — accepted last 1h > 3 × avg of the same hour-of-day over 7d (use `rate(...[1h])` vs `avg_over_time(rate(...[1h])[7d:1h])`) with floor 50
  4. `OutboundSuppressionSpike` — increase in suppressions or rate of hard_bounce suppressions > 10/hour (use `increase(hidemail_outbound_bounced_total{category="unknown_recipient"}[1h])` as proxy if suppressions gauge cannot increase())
  5. `OutboundDomainBroken` — `hidemail_outbound_domain_verified == 0` for a domain that had verified recently — practical form: `hidemail_outbound_domain_verified == 0` AND `hidemail_outbound_accepted_total > 0` (ever sent)
  6. `OutboundOperatorDnsFailing` — `hidemail_outbound_operator_dns_ok == 0`
  7. `OutboundQueueDepthHigh` — `hidemail_outbound_queued > 500`
  8. `OutboundEventConsumerLag` — `hidemail_outbound_event_consumer_lag > 100` while `queued > 0`
  9. `OutboundCapNearLimit` — `hidemail_outbound_daily_sent / hidemail_outbound_daily_limit > 0.90` (Prometheus ignores non-numeric Inf ratios — use `daily_limit < +Inf` guard via `hidemail_outbound_daily_limit < 1e12` or similar)
- Optional placeholders as comments (not required alerts if series absent in M2): ZoneMTA/Mongo down, sending IP blacklisted — note in file that `zonemta_*` alerts stay with ZoneMTA scrape.
- Test: YAML loads (use `js-yaml` already in backend tree, or JSON-compatible assert via manual parse of structure); every rule `alert` name above present; file starts with documented thresholds; bounce threshold 0.05 and deferral 0.20 appear in exprs.

- [ ] **Step 1: Write failing test**

- [ ] **Step 2: Author the alerts YAML**

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add grafana/hidemail-outbound-alerts.yml backend/tests/grafana/hidemailOutboundAlerts.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add Prometheus alert rules for outbound Send
EOF
)"
```

---

### Task 8: Docs / env touch-up and full-suite verification

**Files:**
- Modify: `.env.example` — document that metrics token is issued via API (no new required env var beyond existing outbound ones); mention customer scrape path
- Modify: `backend/services/openApiSpec.js` only if Task 3/4 left gaps
- Modify: `docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md` — mark M2 Done when this task's suite is green (controller does this in the summary step if preferred; this task may leave roadmap to the controller)

**Interfaces:** none new.

- [ ] **Step 1: Ensure `.env.example` notes `/api/outbound/metrics` + `hm_metrics_...`**

- [ ] **Step 2: Run full backend suite** — `cd backend && npm test` — expect PASS (or only pre-existing open-handle warnings)

- [ ] **Step 3: Confirm `mta/` untouched: `git diff --name-only origin/main...HEAD -- mta/` shows only M0/M1 files already committed, no new M2 mta diffs in this task's commit

- [ ] **Step 4: Commit docs if changed**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
docs(outbound): note customer metrics scrape and hm_metrics token
EOF
)"
```

---

## Self-review (plan author)

1. **Spec coverage:** §5.8 series table → Tasks 1/4/5; customer scrape + token → 3/4; operator + account label + DNS/lag/operator DNS → 5; dashboard → 6; alerts list → 7; metrics token in 5.2 → 3. Portal scrape_config **UI** deferred to M4; API returns scrapeConfig JSON now.
2. **Step scan:** each step is one action; bodies left to implementer where signatures + tests decide.
3. **Type consistency:** store method names reused in Tasks 2–5; token prefix `hm_metrics_`; route `/api/outbound/metrics` vs management `/api/outbound/metrics-token`.
4. **Review Focus:** five pins assigned to Tasks 1, 2, 3/4, 4, 5.
5. **Proportion:** plan argues from §5.8 without transcribing Grafana panel JSON bodies.
