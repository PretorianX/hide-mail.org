# Postfix HTTP API → Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap compose to `postfix-http-api` and sync real Postfix delivery events into Activity via `outbound:events`.

**Architecture:** Capture Postfix `queue_id` at Send accept; poll `GET /v1/events`; map delivered/deferred/bounced/expired into existing Redis stream + `eventConsumer`. Stop marking `delivered` at SMTP accept.

**Tech Stack:** Node.js backend, Redis, Docker Compose, `ghcr.io/pretorianx/postfix-http-api:boky-v4.4.0`

**Spec:** `docs/superpowers/specs/2026-11-19-postfix-http-api-activity-design.md`

## Global Constraints

- Image: `ghcr.io/pretorianx/postfix-http-api:boky-v4.4.0`
- API: compose-network only; never publish host `:8025`
- Defaults: `POSTFIXAPI_LISTEN=0.0.0.0:8025`, `POSTFIXAPI_ALLOW_PLAINTEXT=true`
- Backend token env: `POSTFIX_API_TOKEN`; base URL default `http://postfix-relay:8025` (prod) / `http://postfix:8025` (dev)
- `expired` → `bounced`; ignore `processed`
- Cursor key: `outbound:postfix-api:events-cursor`; qid index: `outbound:postfix-qid:<qid>`

## Review Focus

- SMTP response without `queued as` → message stays `queued`, warning logged (Task 1+2)
- Unknown `queue_id` on event feed → skip, still advance cursor (Task 3)
- Bridge fetch failure → no crash; cursor unchanged (Task 3)
- Cursor ahead after SQLite wipe → empty pages + metric/log; no auto-reset (Task 3)
- Accept-time metrics must not `incrDelivered` (Task 2)

## File Structure

- Create: `backend/services/outbound/postfixQueueId.js` — parse SMTP response
- Create: `backend/services/outbound/postfixApiClient.js` — Bearer GET helper
- Create: `backend/services/outbound/postfixApiEventBridge.js` — poll loop + XADD
- Modify: `backend/services/outbound/messageStore.js` — `postfixQueueId` + qid index
- Modify: `backend/services/outbound/sendService.js` — queued status, store qid, set Message-ID
- Modify: `backend/config/config.js` — postfix API settings
- Modify: `backend/server.js` — start bridge
- Modify: `docker-compose.yml`, `docker-compose-dev.yml`, `deploy/README.md`, `.env.example`
- Test: `backend/tests/services/outbound/postfixQueueId.test.js`, `postfixApiEventBridge.test.js`, update `sendService.test.js` / metrics tests

---

### Task 1: Parse queue id + messageStore index

**Files:**
- Create: `backend/services/outbound/postfixQueueId.js`
- Modify: `backend/services/outbound/messageStore.js`
- Test: `backend/tests/services/outbound/postfixQueueId.test.js`, extend `messageStore.test.js`

**Interfaces:**
- Produces: `parsePostfixQueueId(response: string) -> string | null`
- Produces: `messageStore.indexPostfixQueueId({ queueId, messageId })`, `messageStore.getMessageIdByPostfixQueueId(queueId)`, `createMessage` accepts `postfixQueueId`

- [x] **Step 1: Failing tests** — parse `250 2.0.0 Ok: queued as C95E96B727` → `C95E96B727`; long base52 id; null on garbage; index round-trip
- [x] **Step 2: Implement parse + store helpers**
- [x] **Step 3: Tests pass**
- [ ] **Step 4: Commit** `feat(outbound): parse and index Postfix queue ids` (deferred — user did not request commit)

### Task 2: Send leaves Activity queued

**Files:**
- Modify: `backend/services/outbound/sendService.js`
- Test: `backend/tests/services/outbound/sendService.test.js`, `sendService.metrics.test.js`

**Interfaces:**
- Consumes: `parsePostfixQueueId`, `indexPostfixQueueId`
- Produces: after accept, message `status === 'queued'`, `postfixQueueId` set when parse succeeds; no `incrDelivered`

- [x] **Step 1: Failing tests** — success path status queued; metrics not delivered; `messageId` header `<{uuid}@hm-send.hide-mail.org>`; stores qid from mock `response`
- [x] **Step 2: Implement sendService changes**
- [x] **Step 3: Tests pass**
- [ ] **Step 4: Commit** `feat(outbound): keep Activity queued until Postfix delivery events` (deferred — user did not request commit)

### Task 3: Event bridge

**Files:**
- Create: `backend/services/outbound/postfixApiClient.js`, `postfixApiEventBridge.js`
- Modify: `backend/config/config.js`, `backend/server.js`
- Test: `backend/tests/services/outbound/postfixApiEventBridge.test.js`

**Interfaces:**
- Produces: `createPostfixApiClient({ baseUrl, token })`, `processEventBatch({ events, … })`, `startPostfixApiEventBridge()`, `stopPostfixApiEventBridge()`
- Maps events → XADD `outbound:events` with `streamId: postfix-api:<id>`

- [x] **Step 1: Failing tests** — delivered/deferred/bounced/expired mapping; skip unknown qid; advance cursor; fetch error leaves cursor; empty page with cursor>0 logs stale
- [x] **Step 2: Implement client + bridge + config + server start (no-op if token/url missing, error log)**
- [x] **Step 3: Tests pass**
- [ ] **Step 4: Commit** `feat(outbound): bridge postfix-api events into outbound:events` (deferred — user did not request commit)

### Task 4: Compose + deploy docs

**Files:**
- Modify: `docker-compose.yml`, `docker-compose-dev.yml`, `deploy/README.md`, `.env.example` if present

- [x] **Step 1: Swap image, add POSTFIXAPI_* defaults, postfix-data volume, backend POSTFIX_API_* env; no host 8025 ports**
- [x] **Step 2: Document recreate postfix before backend, token wiring, cursor reset**
- [ ] **Step 3: Commit** `feat(deploy): run postfix-http-api image for delivery tracing` (deferred — user did not request commit)
