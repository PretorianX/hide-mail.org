# Outbound Send M4 — Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the customer Send portal at `https://send.hide-mail.org`: Vite/React/TS app with a copied mailduck design-system subset, licence-key unlock, and pages for Overview, Domains (DNS check), Activity, Suppressions, API keys, and Metrics (token + scrape_config), plus Docker/compose/nginx/CI so the portal image deploys beside the existing stack.

**Architecture:** A new `portal/` app (mailduck `frontend-vite-app` shape) talks same-origin to `/api/outbound/*` with `X-License-Key`. Design tokens/theme and only the components the portal needs are copied from `@mailduck/design-system` **0.1.2** into `portal/src/design-system/` (version recorded; no webmail-only components). Small backend gaps for the portal ship in this milestone: account message index + activity list, domain list includes DNS records, and account summary carries rate + delivery window counts. Host nginx gains a `send.hide-mail.org` server block; `hide-mail.org` refuses `/api/outbound/`. Existing CRA `frontend/` and `mta/` (Node 22 + patch-package) are untouched in behaviour.

**Tech Stack:** Vite 6, React 18, TypeScript strict, react-router-dom 6, styled-components 6, Jest + Testing Library, nginx (static SPA image), Express (backend additions), Jest (backend). No axios unless already chosen — prefer `fetch` like the vite template.

**Spec:** `docs/superpowers/specs/2026-11-17-outbound-send-design.md` (sections 5.9 portal, 5.2 credentials, 5.3 DNS UI, 5.8 scrape_config, 5.11 deploy/CI, 6 milestone 4, 7 go-live)

**Also read:**
- `.superpowers/sdd/m3-controller-summary.md` — Activity must surface late-bounce status transitions.
- `backend/routes/outbound/*`, `backend/services/openApiSpec.js` — existing outbound APIs.
- `/Users/andreymartynyuk/Personal/mailduck_portal/mailduck-design-system` (v0.1.2) — copy source.
- `/Users/andreymartynyuk/Personal/mailduck_portal/templates/frontend-vite-app` and `mailduck-admin` — layout/auth cues.

## Global Constraints

- Work only in `/Users/andreymartynyuk/Personal/hide-mail-send` on `feat/send-service`. Never edit `/Users/andreymartynyuk/Personal/hide-mail.org`. No push. Do not edit `changelog.md`.
- Product UI name is **Send**; licence type remains `outbound`. Brand signal on Unlock and shell: “Send” / “Hide Mail Send”.
- Design-system copy: source version **0.1.2** recorded in `portal/src/design-system/VERSION` (and a one-line README). Copy **tokens**, **theme**, and only portal-needed components: `AdminLayout`, `SideMenu`, `NavRail`, `MobileMenu`, `Button`, `IconButton`, `Input`, `Badge`, `Alert`, `EmptyState`, `Spinner`, `LoadingState`, `ConfirmDialog`, `Modal`, `Card`, `Header`, `SrOnly`, `ActionMenuItem`, `DropdownMenu`, `Icons` (full icon set as shipped — do not strip). **Do not copy** webmail-only: `WebmailLayout`, `Webmail*`, `MailFolderTree`, `MailMessageRow`, `MessageActionsSheet`, `AttachmentActionsSheet`, `FolderOperationModal`, `ComposeEmailModal`, `PinInput`, `SiteLayout`, `UserSpaceLayout`, `Footer`, `Avatar`, `Toggle`, `TextArea`.
- Portal auth: every management call uses `X-License-Key` (localStorage key `hm_outbound_license`). On 401/403 clear key and route to Unlock. Never put the licence in the URL.
- Same-origin: production portal is served at `send.hide-mail.org`; API paths are `/api/outbound/...` (no CORS needed in prod). Dev: Vite proxy `/api` → backend.
- Daily cap is shown read-only. Rate limit (`ratePerMinute`) is shown next to the daily cap and must never be labelled as a daily cap.
- `mta/` Docker runtime stays `node:22-bookworm-slim`; do not touch `mta/package.json`, lockfile, or `patches/`. Report “mta tree untouched” when true.
- Do not break existing CRA `frontend/` (root package) — no shared dependency changes that require CRA rebuild semantics unless unavoidable; portal is a separate tree.
- `portal/` is a fourth dependency tree: extend `security-audit.yml`, `.cursor/rules/dependencies.mdc`, and security-maintainer skill text to audit it. `npm audit --audit-level=high` in `portal/` must exit 0.
- Out of scope: self-serve purchase, templates, SMTP submission, operator HTTP UI, editing `changelog.md`, push.

## Review Focus

- **Unlock rejects non-outbound / invalid keys and never stores them.** Pin: Task 3 — paste invalid key → unlock call fails; localStorage unset; Domains route redirects to Unlock.
- **Domains DNS table matches check API shape (per-NS answers + plain reasons) and Check DNS refreshes state.** Pin: Task 4 — mock check response with one fail (`missing`) → UI shows ✗ and reason text; after success mock → state badge `verified`.
- **Activity shows current status including late bounce (delivered → bounced).** Pin: Task 5 — fixture message `status=bounced`, `lastResponse` containing `5.1.1` renders status + response.
- **Metrics page shows raw token once on rotate and a ready scrape_config for send.hide-mail.org.** Pin: Task 6 — rotate mock returns key + scrapeConfig; UI shows key once and YAML/JSON scrape_config with `targets: ['send.hide-mail.org']` and Bearer credentials.
- **`hide-mail.org` nginx refuses `/api/outbound/`; `send.hide-mail.org` proxies portal + `/api/outbound/`.** Pin: Task 7 — conf fixtures / documented snippets assert `return 404` (or 444) on main site outbound path and send vhost proxies `/` → portal, `/api/outbound/` → backend.

---

### Task 1: Backend portal APIs (activity, domain records, enriched summary)

**Files:**
- Modify: `backend/services/outbound/messageStore.js` — account message ZSET index on create; `listRecentMessages`
- Modify: `backend/services/outbound/sendService.js` — call index on create; enrich `getAccountSummary`
- Modify: `backend/services/outbound/domainService.js` — `listDomains` includes `selector`, `records`, `lastCheckedAt`
- Create: `backend/routes/outbound/activity.js`, `backend/controllers/outbound/activityController.js`
- Modify: `backend/routes/outbound/index.js` — mount `/activity`
- Modify: `backend/services/openApiSpec.js` — document activity + enriched shapes
- Test: `backend/tests/services/outbound/messageStore.test.js` (extend or new)
- Test: `backend/tests/controllers/outbound/activityController.test.js`
- Test: `backend/tests/services/outbound/domainService.test.js` / summary tests (extend)

**Interfaces:**
- Consumes: existing `messageStore.createMessage`, `outboundMetricsStore.readCounters`, `accountRateLimiter.getLimit`, domain meta.
- Produces:
  - Redis: `outbound:account:<accountId>:messages` — ZSET score=`createdAt` ms, member=`messageId`. On create, `ZADD` + refresh key TTL to `messageRetentionDays`. `listRecentMessages({ accountId, limit=50 })` → ZREVRANGE 0..limit-1, `GET` each message, drop nulls (expired), return newest-first array of message records (no body/subject — already absent).
  - `GET /api/outbound/activity?limit=` — `attachLicense` + `requireOutboundLicense`; default limit 50, max 200; `{ success: true, messages: [...] }`.
  - `listDomains` each item: `{ domain, state, suspended, dailyLimit, selector, records, lastCheckedAt }` (`records` = stored expected/check results from meta).
  - `getAccountSummary` returns:
    - `ratePerMinute: number` (from `accountRateLimiter.getLimit`)
    - `domains: [{ domain, state, suspended, dailyLimit, sentToday, delivered, deferred, bounced, delivered24h, deferred24h, bounced24h, delivered7d, deferred7d, bounced7d }]`
    - Lifetime `delivered`/`deferred`/`bounced` from `readCounters` (sum bounced categories).
    - Window counts: from `listRecentMessages` with limit 500 (or scan ZSET by score), count messages whose `lastEventAt` (fallback `createdAt`) falls in last 24h / 7d and whose `status` is `delivered` | `deferred` | `bounced`.

- [ ] **Step 1: Write failing tests** for index+list, activity 401 without key / 200 with outbound licence, listDomains includes records, summary includes ratePerMinute and window fields.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement** index, activity route, domain list enrichment, summary enrichment. Keep send-key-only POST `/messages` unchanged.

- [ ] **Step 4: Run — expect PASS** (`cd backend && npx jest tests/services/outbound/messageStore.test.js tests/controllers/outbound/activityController.test.js` plus touched summary/domain tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/outbound/messageStore.js backend/services/outbound/sendService.js \
  backend/services/outbound/domainService.js backend/routes/outbound/activity.js \
  backend/controllers/outbound/activityController.js backend/routes/outbound/index.js \
  backend/services/openApiSpec.js backend/tests/
git commit -m "$(cat <<'EOF'
feat(outbound): add activity list and portal summary fields
EOF
)"
```

---

### Task 2: Portal scaffold + design-system copy (0.1.2)

**Files:**
- Create: `portal/` from mailduck `frontend-vite-app` cues (`package.json`, `vite.config.ts` with `/api` proxy to `http://127.0.0.1:3002`, `tsconfig*.json`, `index.html`, `jest.config.ts`, `src/main.tsx`, `src/vite-env.d.ts`, `src/test-setup.ts`)
- Create: `portal/src/design-system/` — copy tokens, theme, selected components; `VERSION` file content `0.1.2`; `README.md` one paragraph on copy provenance
- Create: `portal/src/design-system/index.ts` — re-export copied public API only
- Test: `portal/src/design-system/theme.test.ts` (copied or slim assert ThemeProvider renders)

**Interfaces:**
- Consumes: filesystem copy from `/Users/andreymartynyuk/Personal/mailduck_portal/mailduck-design-system/src/{tokens,theme,components/<allowed>}`
- Produces: importable `@/design-system` (alias `@` → `src`). Fix relative imports inside copied files so they resolve under `portal/src/design-system`. Strip Storybook `*.stories.tsx` from the copy (keep `*.test.tsx` only if they run without Storybook). App name package: `@hidemail/send-portal` or `hidemail-send-portal`.

- [ ] **Step 1: Scaffold `portal/` package** with scripts `dev`, `build`, `test`, `lint`. Pin React 18 + styled-components 6 + react-router-dom 6 + Vite 6. `npm install` → lockfile. Confirm `npm audit --audit-level=high` exits 0 (add overrides only if needed).

- [ ] **Step 2: Copy design-system subset**; write `VERSION`; export barrel; run a smoke test that imports `ThemeProvider` + `Button`.

- [ ] **Step 3: Commit**

```bash
git add portal/
git commit -m "$(cat <<'EOF'
feat(portal): scaffold Vite app and copy design-system 0.1.2
EOF
)"
```

---

### Task 3: Unlock auth, API client, AdminLayout shell, routing

**Files:**
- Create: `portal/src/api/client.ts` — `fetch` wrapper; base `` `${''}` `` (same-origin); always set `X-License-Key` from storage when present; `X-Correlation-ID`
- Create: `portal/src/api/outbound.ts` — typed helpers: `unlockProbe` (`GET /api/outbound/account/summary`), domains, activity, suppressions, send-keys, metrics-token
- Create: `portal/src/auth/license.ts` — get/set/clear `hm_outbound_license`; validate format loosely `^HM-[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$` before probe
- Create: `portal/src/pages/Unlock/Unlock.tsx` (+ test)
- Create: `portal/src/layout/AppShell.tsx` — `AdminLayout` + `SideMenu` items: Overview, Domains, Activity, Suppressions, API keys, Metrics; product title **Send**; lock/sign-out clears key
- Create: `portal/src/App.tsx`, `portal/src/router.tsx` — `/unlock` public; authenticated routes under shell; unknown → Overview; unauthenticated → Unlock
- Test: Unlock + route guard tests with mocked fetch

**Interfaces:**
- Consumes: Task 2 design-system; Task 1 summary endpoint for probe
- Produces: working unlock → Overview navigation; 401 interceptor clears storage

- [ ] **Step 1: Failing tests** — valid format + 200 probe stores key and navigates; 403 does not store; protected route without key redirects to `/unlock`.

- [ ] **Step 2: Implement client, Unlock, shell, router.**

- [ ] **Step 3: Run portal tests — PASS. Commit**

```bash
git add portal/src
git commit -m "$(cat <<'EOF'
feat(portal): add licence unlock, API client, and app shell
EOF
)"
```

---

### Task 4: Domains page + DNS check UI

**Files:**
- Create: `portal/src/pages/Domains/Domains.tsx`, `DomainDetail.tsx`, `DnsRecordsTable.tsx` (+ tests)
- Wire routes: `/domains`, `/domains/:domain`

**Interfaces:**
- Consumes: `GET /api/outbound/domains`, `POST /api/outbound/domains` `{domain}`, `POST /api/outbound/domains/:domain/check`, `DELETE /api/outbound/domains/:domain`
- Produces: list with state badges (`pending`/`verified`/`broken` + suspended); detail matching spec wireframe — records table (type, host, value, pass/fail), per-NS reason lines, **Check DNS** button, read-only daily limit (“No daily cap” when `null`), plan line uses domain `dailyLimit`

- [ ] **Step 1: Tests** with mocked list/check — pending domain shows fail icon + reason; Check DNS calls POST and updates badge.

- [ ] **Step 2: Implement UI.**

- [ ] **Step 3: Commit**

```bash
git add portal/src/pages/Domains
git commit -m "$(cat <<'EOF'
feat(portal): add Domains page with DNS check UI
EOF
)"
```

---

### Task 5: Overview + Activity pages

**Files:**
- Create: `portal/src/pages/Overview/Overview.tsx` (+ test)
- Create: `portal/src/pages/Activity/Activity.tsx` (+ test)

**Interfaces:**
- Consumes: `GET /api/outbound/account/summary`, `GET /api/outbound/activity`
- Overview: per-domain sentToday vs dailyLimit or “No daily cap”; show `ratePerMinute` beside cap with label **Rate limit** / “N per minute”; 24h and 7d delivered/deferred/bounced; domain state.
- Activity: table/list of recent messages — id, domain, recipient, status, lastResponse, timestamps. Status badge must distinguish `queued`/`delivered`/`deferred`/`bounced`/`held` so late bounce is visible.

- [ ] **Step 1: Tests** for summary rendering (null cap → “No daily cap”; rate label) and activity bounced row.

- [ ] **Step 2: Implement. Commit**

```bash
git add portal/src/pages/Overview portal/src/pages/Activity
git commit -m "$(cat <<'EOF'
feat(portal): add Overview and Activity pages
EOF
)"
```

---

### Task 6: Suppressions, API keys, Metrics pages

**Files:**
- Create: `portal/src/pages/Suppressions/Suppressions.tsx` (+ test)
- Create: `portal/src/pages/ApiKeys/ApiKeys.tsx` (+ test)
- Create: `portal/src/pages/Metrics/Metrics.tsx` (+ test)

**Interfaces:**
- Suppressions: list / add (manual) / remove / export CSV download via `GET /api/outbound/suppressions/export`
- API keys: list send keys; create (show raw `hm_send_...` **once**); revoke with ConfirmDialog
- Metrics: GET meta (masked); rotate POST shows raw `hm_metrics_...` once + `scrapeConfig` rendered as copyable Prometheus scrape_config (YAML-ish text is fine); targets `send.hide-mail.org`, path `/api/outbound/metrics`

- [ ] **Step 1: Tests** for one-time key reveal and scrape_config contents.

- [ ] **Step 2: Implement. Commit**

```bash
git add portal/src/pages/Suppressions portal/src/pages/ApiKeys portal/src/pages/Metrics
git commit -m "$(cat <<'EOF'
feat(portal): add Suppressions, API keys, and Metrics pages
EOF
)"
```

---

### Task 7: Docker, compose, nginx, CI, security trees, docs

**Files:**
- Create: `portal/Dockerfile` — multi-stage Node 24 build → `nginx:alpine` SPA with `try_files` → `index.html`
- Create: `portal/nginx.conf` (container default)
- Modify: `docker-compose.yml` — `portal` service image `ghcr.io/pretorianx/hide-mail.org/portal:latest`, publish `127.0.0.1:3003:80`, depends_on backend
- Modify: `docker-compose-dev.yml` if present and parallel
- Modify: `nginx/hide-mail.conf` — refuse `/api/outbound/` on main site; add `send.hide-mail.org` server (HTTP→HTTPS, TLS paths Let’s Encrypt `send.hide-mail.org`, `/` → `127.0.0.1:3003`, `/api/outbound/` → `127.0.0.1:3002`)
- Modify: `nginx/hide-mail.dev.conf` similarly if applicable
- Modify: `.github/workflows/ci.yml` — `portal-tests` job; build-and-push `portal` image; `needs` + publish-ready digest
- Modify: `.github/workflows/security-audit.yml` — portal npm audit step + notify env
- Modify: `.cursor/rules/dependencies.mdc` — four trees including `portal/`
- Modify: `.cursor/skills/security-maintainer/SKILL.md` — audit `portal/`
- Modify: `deploy/hidemail-autodeploy.sh` — include `portal` in `SERVICES`; health-check `PORTAL_URL` default `http://127.0.0.1:3003/`
- Modify: `deploy/README.md` — portal + send hostname notes; go-live DNS/certs pointer
- Modify: `README.md`, `.env.example` — portal / `ALLOWED_ORIGINS` include `https://send.hide-mail.org` (even if same-origin; documents browser tooling)
- Modify: `docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md` — M4 Done when controller summary exists (final step of execution, not this commit if premature)

**Interfaces:**
- Produces: CI builds portal image next to frontend/backend/mta; autodeploy health covers portal.

- [ ] **Step 1: Add Dockerfile + compose + nginx snippets; extend CI/security/deploy.**

- [ ] **Step 2: Verify** `cd portal && npm test && npm run build`; `cd backend && npx jest` on outbound slice still green; confirm root CRA `package.json` unchanged in intent; `mta/` untouched; `(cd portal && npm audit --audit-level=high)`.

- [ ] **Step 3: Commit**

```bash
git add portal/Dockerfile portal/nginx.conf docker-compose.yml docker-compose-dev.yml \
  nginx/ .github/workflows/ .cursor/ deploy/ README.md .env.example \
  docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md
git commit -m "$(cat <<'EOF'
feat(portal): wire Docker, nginx, CI, and security audit for Send portal
EOF
)"
```

---

### Task 8: Controller summary + roadmap complete

**Files:**
- Create: `.superpowers/sdd/m4-controller-summary.md`
- Modify: `docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md` — mark M4 **Done**; note all milestones complete

- [ ] **Step 1: Write PASS/FAIL summary** with commits, test evidence, remaining §7 go-live ops.

- [ ] **Step 2: Mark roadmap M0–M4 done. Commit**

```bash
git add .superpowers/sdd/m4-controller-summary.md docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md
git commit -m "$(cat <<'EOF'
docs(outbound): mark M4 portal complete
EOF
)"
```

---

## Self-review (plan author)

1. **Spec coverage:** §5.9 pages ✓; design-system copy 0.1.2 ✓; send.hide-mail.org ✓; §5.11 CI/portal image/nginx ✓; Activity late-bounce concern from M3 ✓ via status display; §7 left as operator ops in summary.
2. **Backend gaps:** activity list + records on domains + summary windows required for portal — in Task 1.
3. **mta/CRA:** constrained untouched / unbroken.
4. **Review Focus:** each line pinned to Tasks 3–7.
