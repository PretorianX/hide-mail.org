# Postfix Bounce Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route local Postfix NDRs for outbound VERP bounce addresses to `backend:2525` over the Docker network so bounce mailback can update message status.

**Architecture:** Mount a Postfix regexp `transport_maps` file and a `docker-init.d` script that registers a TLS-off SMTP client transport `bounce_internal`. Matching recipients skip public MX/hairpin and deliver to the existing Node inbound listener.

**Tech Stack:** boky/postfix v4.4.0, Docker Compose, Jest (contract tests for regexp lines).

**Spec:** `docs/superpowers/specs/2026-11-19-postfix-bounce-transport-design.md`

## Global Constraints

- Do not change VERP format, `bounceMailbackService`, or inbound RCPT acceptance logic.
- Nexthop is container DNS `backend` port `2525` (not host-mapped 25).
- Return-path host in the map defaults to `rp.hide-mail.org` (same as `OUTBOUND_RETURN_PATH_TARGET` default).
- Do not edit `changelog.md`.
- Conventional commits.

## Review Focus

- Non-bounce recipient (e.g. `user@gmail.com`) must not match the transport regexp — pinned in Task 1.
- `b-id@rp.hide-mail.org` must match as well as `b-id@hm-bounce.customer.tld` — pinned in Task 1.
- Custom transport must disable TLS so cleartext Docker SMTP works — pinned in Task 2 script content check.
- Prod and dev compose both mount the same files — pinned in Task 3.
- Dev `RELAYHOST=mailpit` must not override matching bounce recipients (transport_maps wins) — documented in Task 3 README note; no live Postfix in CI.

---

### Task 1: Regexp transport map + contract test

**Files:**
- Create: `deploy/postfix/transport`
- Create: `backend/tests/deploy/postfixBounceTransport.test.js`

**Interfaces:**
- Produces: regexp map file at `deploy/postfix/transport` with exactly two rules nexthopping `bounce_internal:[backend]:2525`:
  1. `/^b-[^@]+@hm-bounce\./i`
  2. `/^b-[^@]+@rp\.hide-mail\.org$/i`

- [ ] **Step 1: Write failing test** that reads `deploy/postfix/transport`, extracts `/.../flags` patterns, and asserts:
  - `b-479bad37-0df6-4ed8-9a93-79b6cfb445bb@hm-bounce.ecabinet.tax` matches rule 1
  - `b-abc@rp.hide-mail.org` matches rule 2
  - `noreply@hide-mail.org` and `user@gmail.com` match neither
  - each transport line ends with `bounce_internal:[backend]:2525`

- [ ] **Step 2: Run — expect FAIL** (`cd backend && npx jest tests/deploy/postfixBounceTransport.test.js`)

- [ ] **Step 3: Add `deploy/postfix/transport`** with the two regexp lines (and optional `#` comments only).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add deploy/postfix/transport backend/tests/deploy/postfixBounceTransport.test.js
git commit -m "$(cat <<'EOF'
feat(postfix): add regexp transport map for bounce mailback
EOF
)"
```

---

### Task 2: docker-init.d TLS-off transport

**Files:**
- Create: `deploy/postfix/docker-init.d/10-bounce-internal-transport.sh`
- Modify: `backend/tests/deploy/postfixBounceTransport.test.js` (assert script wires master.cf)

**Interfaces:**
- Consumes: transport map from Task 1 (nexthop name `bounce_internal`).
- Produces: executable shell script that appends to `/etc/postfix/master.cf` a `bounce_internal` unix SMTP service with `-o smtp_tls_security_level=none` and `-o smtp_tls_wrappermode=no`. Idempotent if already present.

- [ ] **Step 1: Extend test** — script exists, is executable bit in git (`100755` optional; compose mount is enough if shebang + `chmod +x` in script header via `git update-index`), contains `bounce_internal`, `smtp_tls_security_level=none`, and `smtp_tls_wrappermode=no`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the init script**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add deploy/postfix/docker-init.d/10-bounce-internal-transport.sh backend/tests/deploy/postfixBounceTransport.test.js
git commit -m "$(cat <<'EOF'
feat(postfix): register TLS-off bounce_internal SMTP transport
EOF
)"
```

---

### Task 3: Wire compose + deploy note

**Files:**
- Modify: `docker-compose.yml` (postfix service)
- Modify: `docker-compose-dev.yml` (postfix service)
- Modify: `deploy/README.md`
- Modify: `backend/tests/deploy/postfixBounceTransport.test.js` (compose references)

**Interfaces:**
- Produces: both compose files set `POSTFIX_transport_maps=regexp:/etc/postfix/transport`, mount `./deploy/postfix/transport` → `/etc/postfix/transport:ro`, mount `./deploy/postfix/docker-init.d` → `/docker-init.d:ro`. README one-liner on hairpin + flush deferred queue after deploy.

- [ ] **Step 1: Extend test** — `docker-compose.yml` and `docker-compose-dev.yml` each contain `POSTFIX_transport_maps=regexp:/etc/postfix/transport` and both mount paths under `postfix:`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Edit compose files + README**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose-dev.yml deploy/README.md backend/tests/deploy/postfixBounceTransport.test.js
git commit -m "$(cat <<'EOF'
feat(postfix): wire bounce transport map into compose
EOF
)"
```

---

## Execution

Native (inline) — small ops change, few files, user said go.
