# Postfix bounce transport (hairpin fix)

**Status:** approved  

**Date:** 2026-11-19

## Intent

Local Postfix NDRs for outbound Send (`b-<id>@hm-bounce.<domain>` / `OUTBOUND_RETURN_PATH_TARGET`) must reach the existing inbound bounce mailback path so ops/activity status updates. Today Postfix resolves the public A of `rp.hide-mail.org` and times out on its own IP:25 from inside Docker.

## Goals

- Route those recipients over the Docker network to `backend:2525` (same listener that already runs Bounce Read → `outbound:events`).
- One regexp rule that covers every customer `hm-bounce.*` plus the return-path target host.
- No new product code path; no pipe script.

## Non-goals

- cPanel sender-callout / `noreply@` acceptance (separate follow-up).
- Changing VERP format, ZoneMTA, or bounceMailbackService.
- Fixing `/etc/aliases.lmdb` noise (optional drive-by only if trivial while touching Postfix).

## Approaches considered

1. **Regexp `transport_maps` → `smtp:[backend]:2525`** (chosen) — keeps RCPT intact; one rule; same path as public late DSNs once they hit `:25`.
2. Canonical rewrite to `@rp.hide-mail.org` then domain transport — works with mailback, but two maps for no gain.
3. Pipe-to-script — duplicates mailback; still need public MX → backend for remote DSNs.

## Design

- Add `deploy/postfix/transport` (or `postfix/transport`) as a **regexp** map, e.g.:
  - `/^b-[^@]+@hm-bounce\./i` → dedicated transport nexthop `[backend]:2525`
  - `/^b-[^@]+@<OUTBOUND_RETURN_PATH_TARGET>$/i` → same (host from env at deploy time; default `rp.hide-mail.org`)
- `POSTFIX_transport_maps=regexp:/etc/postfix/transport` on the `postfix` service; mount the file read-only.
- Dedicated `master.cf` SMTP client (via `/docker-init.d/` script) with `smtp_tls_security_level=none` so cleartext Docker SMTP to the Node listener succeeds (listener is `secure: false`, AUTH disabled).
- Compose: postfix already shares `internal` + `default` with backend; ensure `depends_on` / network reachability `backend:2525` (container port, not host-mapped 25).
- After deploy: flush or wait out deferred queue id `C95E96B727` (and similar); expect mailback log + message status `bounced`/`deferred` in ops activity.
- Document in `deploy/README.md` one line: why the map exists (hairpin), not a second bounce pipeline.

## Builder calls

- Map path under `deploy/postfix/`; init script next to it.
- Mirror the same env/volumes in `docker-compose-dev.yml`.
- No automated test in CI for live Postfix; manual verify: send to a known-bad RCPT, confirm NDR hits backend logs without public `:25` timeout.
