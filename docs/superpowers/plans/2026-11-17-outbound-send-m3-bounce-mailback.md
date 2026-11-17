# Outbound Send M3 — Bounce Mail-back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept late DSN mail at `b-<id>@hm-bounce.<domain>` (and the return-path target host), parse it with Bounce Read, and feed a `bounced`/`deferred` event into the same Redis stream / consumer / suppression / metrics path ZoneMTA already uses.

**Architecture:** The existing inbound SMTP listener gains a bounce-recipient gate. A small mail-back service parses the envelope VERP address, runs `bounceReadService.readBounce`, maps the DSN class to an outbound event type, and `XADD`s to `outbound:events`. The M1 consumer + M2 `outboundMetricsStore` then update message status, suppressions, and counters. Metrics gain a delivered→bounced supersede so a late DSN after a prior `ACCEPTED` still lands as one bounce, not a stuck delivered count.

**Tech Stack:** Node 24+ (backend), existing `smtp-server` inbound listener, `bounceReadService`, Redis stream `outbound:events`, Jest. No new runtime dependencies. `mta/` untouched (Node 22 + patch-package preserved).

**Spec:** `docs/superpowers/specs/2026-11-17-outbound-send-design.md` (sections 5.3 return path, 5.7 events/suppression late bounce, 6 milestone 3)

**Also read:**
- `.superpowers/sdd/m2-controller-summary.md` — late bounce must feed the same `outboundMetricsStore` / event path.
- `backend/services/outbound/eventConsumer.js` — existing handler contract.
- `backend/services/bounceReadService.js` — DSN parse API.
- `mta/plugins/hidemail-outbound.js` — `parseBounceEnvelopeFrom` regex to mirror (do not import across trees).

## Global Constraints

- Work only in `/Users/andreymartynyuk/Personal/hide-mail-send` on `feat/send-service`. Never edit `/Users/andreymartynyuk/Personal/hide-mail.org`. No push. Do not edit `changelog.md`.
- Do not start M4 (portal). No portal UI.
- `mta/` Docker runtime stays `node:22-bookworm-slim`; do not touch `mta/package.json`, lockfile, or `patches/`. Report "mta tree untouched" when true.
- Add no new runtime dependency.
- Envelope VERP form is exactly `b-<messageId>@hm-bounce.<domain>` (same regex as the ZoneMTA plugin: `/^b-([^@]+)@hm-bounce\.(.+)$/i`). Also accept `b-<messageId>@<OUTBOUND_RETURN_PATH_TARGET>` (domain recovered from `messageStore`).
- Late bounce is fed by `XADD outbound:events` with the same field shape ZoneMTA writes: `type`, `messageId`, `domain`, `response`, `at`. Do not bypass the consumer for status/suppression/metrics.
- Hard DSN → `type=bounced`. Soft or delayed DSN → `type=deferred`. Non-DSN mail to a bounce address is accepted at RCPT then silently dropped (never stored in a disposable inbox).
- Suppression rules unchanged: only hard `unknown_recipient` suppresses (`hard_bounce`); policy/reputation/mailbox/other never suppress.
- Out of scope: portal, complaint FBL, mta plugin changes, changing ZoneMTA `queue:bounce` behaviour.

## Review Focus

- **Late hard DSN after ZoneMTA `delivered` must become `bounced` in status and metrics.** Pin: Task 4 — seed terminal `delivered`, process mail-back hard 5.1.1, assert message `status=bounced`, `delivered_total` decreased by 1, `bounced{category="unknown_recipient"}` increased by 1, suppression added.
- **Replay of the same late bounce must not double-count.** Pin: Task 2/4 — process the same DSN twice; suppression once; bounced counter once.
- **Ordinary inbound mail to a real mailbox is unchanged.** Pin: Task 3 — existing `inboundMailService` tests still pass; bounce routing only when recipient matches VERP helpers.
- **RCPT TO for `b-*@hm-bounce.<domain>` is accepted even when the domain is not a disposable inbox domain.** Pin: Task 3 — helper/`onRcptTo` path accepts bounce recipient without `isDomainValid`.
- **Soft DSN must not suppress and must emit `deferred`, not `bounced`.** Pin: Task 2 — soft/4.2.1 (or soft class) → stream type `deferred`, no suppression after consumer.

---

### Task 1: Bounce envelope address helpers

**Files:**
- Create: `backend/services/outbound/bounceEnvelope.js`
- Test: `backend/tests/services/outbound/bounceEnvelope.test.js`

**Interfaces:**
- Consumes: `process.env.OUTBOUND_RETURN_PATH_TARGET` (e.g. `rp.hide-mail.org`)
- Produces:
  - `parseBounceEnvelopeFrom(address: string) -> { messageId: string, domain: string } | null` — matches `/^b-([^@]+)@hm-bounce\.(.+)$/i`; domain lowercased.
  - `parseOutboundBounceRecipient(address: string) -> { messageId: string, domain: string | null } | null` — first try `parseBounceEnvelopeFrom`; else if local-part is `b-<id>` and host equals `OUTBOUND_RETURN_PATH_TARGET` (case-insensitive), return `{ messageId, domain: null }`; else `null`.
  - `isOutboundBounceRecipient(address: string) -> boolean` — `parseOutboundBounceRecipient(address) !== null`.

- [ ] **Step 1: Write failing tests** — well-formed `b-abc@hm-bounce.mail.example.com` → `{messageId:'abc', domain:'mail.example.com'}`; uppercase host lowercased; `someone@elsewhere.com` → null; with `OUTBOUND_RETURN_PATH_TARGET=rp.hide-mail.org`, `b-abc@rp.hide-mail.org` → `{messageId:'abc', domain:null}`; `b-abc@other.org` → null; `isOutboundBounceRecipient` true/false accordingly.

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest tests/services/outbound/bounceEnvelope.test.js`)

- [ ] **Step 3: Implement `bounceEnvelope.js`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/services/outbound/bounceEnvelope.js backend/tests/services/outbound/bounceEnvelope.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): add bounce envelope VERP address helpers
EOF
)"
```

---

### Task 2: Bounce mail-back service → `outbound:events`

**Files:**
- Create: `backend/services/outbound/bounceMailbackService.js`
- Test: `backend/tests/services/outbound/bounceMailbackService.test.js`

**Interfaces:**
- Consumes: Task 1 parsers; `bounceReadService.readBounce` / `BounceReadError`; `messageStore.getMessage`; `redisService.client` for `XADD`.
- Produces:
  - `processBounceMailback({ recipient, rawBody, redisClient? }) -> Promise<{ handled: boolean, reason?: string, eventType?: string, messageId?: string }>`
  - Flow:
    1. `parsed = parseOutboundBounceRecipient(recipient)`; if null → `{ handled: false, reason: 'not_bounce_recipient' }`.
    2. Resolve `messageId` from parsed; if `domain` is null, load `messageStore.getMessage(messageId)` and take `message.domain` (and require message exists); if domain present, still load message (needed later for existence check) — if message missing → `{ handled: true, reason: 'unknown_message' }` (accept & drop; do not throw).
    3. `readBounce(rawBody)`. On `BounceReadError` with `NOT_A_BOUNCE` / `EMPTY_BOUNCE` / `BOUNCE_TOO_LARGE` → `{ handled: true, reason: 'not_a_dsn' }` (silent drop).
    4. Pick primary recipient record: first hard if any, else first soft/delayed, else first entry. If none → `{ handled: true, reason: 'empty_dsn' }`.
    5. Map class: `hard` → event `type='bounced'`; `soft` or `delayed` → `type='deferred'`; `delivered`/`relayed`/`expanded` → `{ handled: true, reason: 'dsn_not_failure' }` (no event).
    6. Build `response` string: prefer `` `${smtpCode || ''} ${status} ${cleanDiagnostic || title || ''}`.trim() `` from the DSN recipient fields (whatever Bounce Read exposes: `status`, `smtpCode`, `diagnostic`/`cleanDiagnostic`/`title` — use available fields; must include the enhanced status like `5.1.1` so the classifier can suppress).
    7. `XADD outbound:events * type <type> messageId <id> domain <domain> response <response> at <ISO>` on `redisClient || redisService.client`.
    8. Return `{ handled: true, eventType: type, messageId }`.

- [ ] **Step 1: Write failing tests** with a minimal multipart DSN fixture (reuse Bounce Read test shape) addressed to `b-m1@hm-bounce.mail.example.com`, message seeded in messageStore:
  - hard `5.1.1` → XADD fields `type=bounced`, `messageId=m1`, `domain=mail.example.com`, response contains `5.1.1`
  - soft status → `type=deferred`
  - unknown messageId → handled, no XADD
  - plain non-DSN body → handled, no XADD
  - ordinary recipient `user@hide-mail.org` → `handled: false`
  - `b-m1@rp.hide-mail.org` with env target set → resolves domain from messageStore and XADDs

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `bounceMailbackService.js`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/services/outbound/bounceMailbackService.js backend/tests/services/outbound/bounceMailbackService.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): map late DSN mail-back into outbound:events
EOF
)"
```

---

### Task 3: Wire inbound SMTP RCPT + delivery routing

**Files:**
- Modify: `backend/services/inboundMailService.js` — at start of `deliverInboundMessage`, if `isOutboundBounceRecipient(recipient)`, call `processBounceMailback` and return `{ delivered: false, reason: 'outbound_bounce_mailback', mailback }` (never `storeEmail`).
- Modify: `backend/server.js` — in `onRcptTo`, before `isDomainValid` rejection: if `isOutboundBounceRecipient(address.address)`, accept (callback()) and count accepted.
- Test: `backend/tests/services/inboundMailService.test.js` (extend)
- Test: `backend/tests/services/outbound/inboundBounceRouting.test.js` (new) — unit-test the RCPT helper path by exporting a small `acceptInboundRecipient(address)` from server is **not** required if awkward; prefer testing via inboundMailService + a focused test that imports `isOutboundBounceRecipient` and documents server.js wiring. Add one test file that requires `server.js`'s recipient decision only if extractable; otherwise: (a) inboundMailService bounce route test with mocked mailback; (b) a tiny `backend/services/outbound/inboundBounceRcpt.js` with `shouldAcceptOutboundBounceRcpt(address) -> boolean` used by `server.js` so the RCPT gate is unit-tested without booting SMTP.

**Interfaces:**
- Consumes: Task 1 `isOutboundBounceRecipient`; Task 2 `processBounceMailback`
- Produces: `shouldAcceptOutboundBounceRcpt(address: string) -> boolean` in `backend/services/outbound/inboundBounceRcpt.js` (thin alias of `isOutboundBounceRecipient` — keeps server.js free of regex details). Server `onRcptTo` calls it before domain validation.

- [ ] **Step 1: Write failing tests** — inboundMailService with bounce recipient calls mailback and does not storeEmail; normal mailbox path unchanged; `shouldAcceptOutboundBounceRcpt('b-x@hm-bounce.a.com') === true` and `'a@hide-mail.org' === false`.

- [ ] **Step 2: Implement wiring**, run tests — expect PASS. Confirm existing inbound suite still green.

- [ ] **Step 3: Commit**

```bash
git add backend/services/inboundMailService.js backend/server.js backend/services/outbound/inboundBounceRcpt.js backend/tests/services/inboundMailService.test.js backend/tests/services/outbound/inboundBounceRouting.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): accept and route late bounce mail on inbound SMTP
EOF
)"
```

---

### Task 4: Metrics supersede for late bounce after delivered + end-to-end path

**Files:**
- Modify: `backend/services/outbound/outboundMetricsStore.js` — change `incrBounced` so when terminal key already holds `delivered`, it supersedes: DECR delivered (not below 0), SET terminal to `bounced`, INCR bounced category, and do **not** DECR queued again (queued already left at deliver time). When terminal is already `bounced`, still return false (no double count). When unset, keep current behaviour (SET NX + INCR + DECR queued).
- Modify: `backend/tests/services/outbound/outboundMetricsStore.test.js` — add supersede cases.
- Test: `backend/tests/services/outbound/bounceMailbackE2E.test.js` — seed message + accept metrics via store; XADD path: call `processBounceMailback` then `eventConsumer.createHandler(...)` on the XADD'd fields (or `consumeOnce` with fake redis that the mailback wrote to); assert status bounced, suppression for 5.1.1, metrics delivered→bounced supersede; second identical mailback+consume leaves counts unchanged.

**Interfaces:**
- Consumes: Task 2 mailback; existing `eventConsumer.createHandler` / `consumeOnce`; `outboundMetricsStore`
- Produces: corrected `incrBounced` semantics documented in the store file header comment.

- [ ] **Step 1: Write failing store supersede test + E2E test**

- [ ] **Step 2: Implement store change**, run — expect PASS

- [ ] **Step 3: Commit**

```bash
git add backend/services/outbound/outboundMetricsStore.js backend/tests/services/outbound/outboundMetricsStore.test.js backend/tests/services/outbound/bounceMailbackE2E.test.js
git commit -m "$(cat <<'EOF'
feat(outbound): supersede delivered metrics on late bounce mail-back
EOF
)"
```

---

### Task 5: Docs touch + roadmap

**Files:**
- Modify: `.env.example` — one-line note near `OUTBOUND_RETURN_PATH_TARGET` that inbound SMTP accepts late DSNs for `b-*@hm-bounce.<domain>` and `b-*@<target>`.
- Modify: `docs/superpowers/plans/2026-11-17-outbound-send-roadmap.md` — mark M3 Done when this plan's implementation is finished (controller does this after Task 4; this task only adds the env note if not already present).
- No `changelog.md`.

- [ ] **Step 1: Add env note if missing**

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
docs(outbound): note late bounce mail-back on return-path addresses
EOF
)"
```

---

## Self-review notes

- Spec §5.7 late bounce → Tasks 2–4 cover accept, parse, match via `b-<id>`, same event path, suppression via existing consumer.
- Soft DSN → deferred pinned in Task 2 Review Focus.
- Delivered→late bounce metrics correction is required for M2's "same metrics path" concern — Task 4.
- `mta/` unchanged by design; plugin already emits synchronous rejects to the same stream.
