# Hide Mail Send: outbound sending with verified domains

Status: draft, awaiting approval. Branch `feat/send-service`, cut from `origin/main` at `e02842c`.

Items marked **(call)** were decided by the author, not by the product owner, and are open to
correction.

## 1. Intent

Hide Mail gains a SendGrid-style sending product. A customer proves control of a domain, sends
mail from it through an HTTP API, and watches delivery, bounces, deferrals, invalid addresses and
suppressions in a portal and in their own Prometheus.

The first customer is one site for accountants with about 25,000 active customers. Only the site
sends; its customers only receive. The product must be a real feature of Hide Mail from the first
release, with a customer-facing portal, because more customers and more capabilities (templates,
branded links) follow.

## 2. Goals, non-goals, anti-goals

Goals

- A customer adds a sending domain or subdomain, gets the exact DNS records to publish, and cannot
  send until those records are confirmed on the domain's own nameservers.
- A server-side integration sends one message per API call and can retry safely.
- Each domain has a daily cap. The operator can set any cap, or no cap, per domain.
- Delivered, deferred, bounced, invalid and suppressed are counted per domain, shown in the
  portal, exposed to the customer as a Prometheus scrape target, and exposed to the operator for
  every domain.
- The operator has a Grafana dashboard and alert rules that catch anomalies, including on domains
  with no cap.
- A portal in the mailduck design, opened with a licence key.

Non-goals for this design (later phases, section 9)

- Templates, batch sends, scheduled sends.
- Link branding and click tracking.
- Feedback-loop (complaint) ingestion.
- Self-serve purchase of a sending plan through WayForPay.
- SMTP submission by customers. The API is the only way in.
- User accounts, passwords, roles.

Anti-goals

- A cap that is "unlimited" in the portal but quietly enforced somewhere else.
- A domain that sends while its DNS records are wrong.
- Metrics that stop or thin out for uncapped domains.
- Mail that leaves without a record of what happened to it.

## 3. Constraints found in the code and tools

- Hide Mail has no accounts. A licence key (`HM-XXXX-XXXX-XXXX-XXXX`) stored in Redis is the only
  credential, sent as `X-License-Key`. Licences are created only by the WayForPay webhook and
  expire with a Redis TTL.
- The licence type `sender` is already taken by Sender Check, so this product uses the type
  `outbound` in code and "Send" in the UI **(call)**.
- Existing API keys (`hm_api_...`) expire after 30 days. A production sender cannot rely on that.
- Redis (append-only file) is the only datastore. The backend redeploys within five minutes of
  every merge to `main`, so anything held only in backend memory is lost several times a day.
- The backend already has: an inbound SMTP listener on port 25, a Postfix relay for forwarding,
  `nodemailer` 10, `mailauth` 7, DNS record interpretation in `services/senderCheck/records.js`,
  and a delivery-status parser in `services/bounceRead/`.
- `prom-client` metrics listen on `0.0.0.0:9001` inside the backend container; only the compose
  port mapping limits them to host loopback. Any container on the same Docker network can read
  them, and they will carry every account's series.
- Existing paid APIs are rate limited per client IP (`services/apiRateLimiter.js`).
- ZoneMTA 3.10.3 needs MongoDB for its queue and Redis for counters. Hooks confirmed in its
  source: `message:headers`, `message:queue`, `sender:fetch` (an error returned here goes to
  ZoneMTA's response-error handling before any connection is made), `sender:connection` (where
  DKIM keys are attached
  through `delivery.dkim.keys`), `log:entry` (actions `QUEUED`, `ACCEPTED`, `DEFERRED`,
  `REJECTED`, `DROP`, `NOQUEUE`), `queue:bounce`, `queue:release`. It serves its own
  `zonemta_*` metrics on its API port.
- ZoneMTA is licensed EUPL-1.1+. The plugin lives in this public repository, which satisfies the
  source-availability side; nothing here is legal advice.
- `npm audit` on a tree containing only `zone-mta@3.10.3` reports 19 advisories (3 critical,
  12 high). `security-audit.yml` fails a tree at `--audit-level=high`, and separately fails when
  any Dependabot alert is open at any severity. A lockfile-only probe shows overrides bring the
  tree to 2 moderate, but only by moving packages ZoneMTA pins exactly across major versions
  (`nodemailer` 7 to 10, `mailauth` 4 to 8, `js-yaml` 4 to 5, `restify` 11 to 12). Whether ZoneMTA
  still delivers mail with those is unproven. See milestone 0.
- The 2 that remain are the `request` package (request forgery through redirects; no patched
  version exists) and `zone-mta` for depending on it. ZoneMTA loads `request` in `lib/sender.js`
  and calls it only when delivering a message by HTTP upload, a mode this design does not
  configure. The alerts stay open until dismissed (section 10).
- `@mailduck/design-system` is `UNLICENSED`, publishes to a LAN-only registry, and has no git
  remote. This repository is public and CI runs on GitHub. CI cannot install the package.
- Production: nginx on the host terminates TLS with Let's Encrypt for `hide-mail.org` and proxies
  to containers on `127.0.0.1`. Images are pulled by a host timer.

## 4. Approaches

Product shape

- **A (chosen).** Send API, rules and state in this backend; ZoneMTA beside it; the portal as a
  new TypeScript app in this repo. Rules sit next to the other paid APIs, the queue is not ours to
  write, and the portal can follow mailduck without fighting the public inbox UI. Cost: two more
  images to build and deploy.
- B. Same backend, portal pages inside the existing CRA frontend. One deploy, but the pages
  inherit the public site's stack, ads CSP and origin.
- C. A separate sending service with its own store. Cleaner split, too heavy for one customer.

Delivery engine

- **ZoneMTA plus one plugin (chosen).** It owns queueing, retries, per-domain throttling and
  signing. Cost: MongoDB, and a dependency tree that needs overrides to pass the audit gate.
- An SMTP AUTH relay of our own on Postfix or `smtp-server`. Delivery works, but bounces and
  deferrals come back as mail or log lines to parse, and the queue would be ours to build.

## 5. Design

### 5.1 Pieces and flow

```
customer backend ──HTTPS──▶ backend /api/outbound ──SMTP (internal)──▶ ZoneMTA ──▶ recipient MX
                              │   ▲                                      │
portal (send.hide-mail.org) ──┘   │                                      │ plugin appends
customer Prometheus ──scrape──────┤                                      ▼
operator Prometheus ──scrape :9001┘◀── consumes ── Redis stream `outbound:events`
```

- The backend is the only writer of product state and the only place a message is accepted.
- The plugin reads one thing from product Redis (the domain's record: signing key and whether it
  may send) and writes one thing (events appended to a stream). The backend consumes the stream
  with a consumer group, so events survive backend redeploys.
- ZoneMTA's SMTP port is on the internal Docker network only. Its API port is also published on
  host loopback so the host's metrics agent can scrape it, as the backend's port 9001 is.
- Customers use one hostname for everything: `https://send.hide-mail.org` serves the portal and
  proxies `/api/outbound/` to the backend, so the portal is same-origin. `hide-mail.org` does not
  serve `/api/outbound/` **(call)**.

### 5.2 Account, licence, credentials

- An **account** has a random `accountId`. All product data is keyed by `accountId`, never by a
  secret. An `outbound` licence carries the `accountId`.
- Licences for this product are issued by the operator (5.10). When a licence expires, sending
  stops; the account's domains and suppression list are kept for 90 days so a renewal restores
  them **(call)**.
- **Send keys** (`hm_send_...`): created and revoked in the portal, named, several per account,
  valid as long as the licence, stored as SHA-256 hashes, shown once **(call)**.
- **Metrics token** (`hm_metrics_...`): read-only, one per account, rotatable, usable only on the
  scrape endpoint.
- The portal authenticates every call with `X-License-Key`, as the existing site does.

### 5.3 Domains and DNS verification

The customer adds a fully qualified name, for example `mail.example.com`. The From address of
every message must be at exactly that name. A name can be verified in one account at a time; a
second account adding a verified name gets `DOMAIN_TAKEN`.

Records issued on add:

| Purpose | Type | Host | Value | Required |
|---|---|---|---|---|
| Signing and proof of control | TXT | `<selector>._domainkey.<domain>` | `v=DKIM1; k=rsa; p=<public key>` | yes |
| Return path (SPF alignment, bounces) | CNAME | `hm-bounce.<domain>` | `OUTBOUND_RETURN_PATH_TARGET`, e.g. `rp.hide-mail.org` | yes |
| DMARC | TXT | `_dmarc.<domain>` or its organizational domain | any valid `v=DMARC1` record; `p=none` is accepted | yes; we suggest a value only when none exists |

- A 2048-bit RSA key pair is generated per domain. The selector is unique per account and domain.
  The private key is encrypted with `OUTBOUND_KEY_ENCRYPTION_SECRET` before it is stored **(call)**.
- There is no separate ownership record: publishing our public key is the proof.
- The customer's own SPF record is not touched. SPF is evaluated on `hm-bounce.<domain>`, which
  resolves through the CNAME to records the operator publishes once: an MX pointing at the Hide
  Mail host and `v=spf1 ip4:<sending IPs> -all`.

How a check is made

1. For each record, find the nameservers of the zone that holds it and ask each one directly, so a
   resolver cache can neither hide a new record nor keep a deleted one alive.
2. A record passes when every nameserver that answers returns the expected value and at least one
   answers. DKIM compares the published `p=` with our key, ignoring whitespace and TXT string
   splits. The CNAME must equal the target exactly. DMARC must be a single syntactically valid
   record; organizational-domain lookup uses the Public Suffix List.
3. Each record reports: expected, what each nameserver returned, and a plain reason
   (`missing`, `mismatch`, `multiple records`, `CNAME where TXT expected`, `no answer`).

States

- `pending`: records issued, not all passing.
- `verified`: all required records pass. Only this state may send.
- `broken`: was verified, and a later check got an authoritative answer that is wrong or empty.
  Sending is refused with `DOMAIN_NOT_VERIFIED` until a check passes again.
- "No answer" from DNS never changes state. It is counted and alertable.

Checks run when the customer presses "Check DNS", and for every verified domain on a timer
(`OUTBOUND_DNS_RECHECK_SECONDS`, default one hour) **(call)**. The same timer checks the
operator's own return-path target and sending-host records, since an error there breaks every
customer at once.

### 5.4 Send API

`POST https://send.hide-mail.org/api/outbound/messages`, `Authorization: Bearer hm_send_...`

```json
{
  "from": { "email": "billing@mail.example.com", "name": "Example Accounting" },
  "to": "client@example.org",
  "subject": "Invoice 2026-114",
  "text": "…", "html": "…",
  "replyTo": "office@example.com",
  "attachments": [{ "filename": "invoice.pdf", "contentType": "application/pdf", "content": "<base64>" }],
  "reference": "invoice-2026-114"
}
```

- One recipient per message **(call)**. No cc or bcc. Batch arrives with templates.
- `Idempotency-Key` header: a repeat within 24 hours returns the first response and sends nothing.
- Checks, in order, each with its own error code and counter: key and licence
  (`401`/`403`), From domain verified and not suspended (`403 DOMAIN_NOT_VERIFIED`,
  `403 DOMAIN_SUSPENDED`), recipient syntax (`422 INVALID_RECIPIENT`), suppression
  (`422 RECIPIENT_SUPPRESSED`), daily cap (`429 DAILY_LIMIT_REACHED` with the reset time), size
  (`413`, `OUTBOUND_MAX_MESSAGE_BYTES`, default 10 MB).
- Before those checks, a rate limit per account, not per IP: `ratePerMinute`, default
  `OUTBOUND_RATE_PER_MINUTE` = 600, answered with `429 RATE_LIMITED` and `Retry-After`
  **(call)**. At the default, 25,000 messages take about 42 minutes. It protects the backend and
  the queue, applies to capped and uncapped domains alike, is shown in the portal next to the
  daily cap, and is raised by the operator per account (5.10). It is not a daily cap and must
  never be presented as one.
- On success: `202 { "id": "…", "status": "queued" }`. The backend builds the MIME message, sets
  the envelope sender to `b-<id>@hm-bounce.<domain>`, and submits it to ZoneMTA over internal
  SMTP. If ZoneMTA does not take it, the API answers `503` and the cap counter is not consumed.
- A message record (recipient, reference, status, timestamps, last remote response; no body, no
  subject) is kept 30 days for the portal and for `GET /api/outbound/messages/:id` **(call)**.

Other endpoints: domains (add, list, check, remove), suppressions (list, add, remove, export),
send keys, metrics token, account summary. All are in the OpenAPI document the repo already
serves.

### 5.5 Caps and plans

- Each domain has `dailyLimit`: a positive integer, or `null` meaning no cap. New domains get
  `OUTBOUND_DAILY_LIMIT_DEFAULT`.
- The count is per domain per UTC day, incremented atomically with the cap check, one per
  accepted message.
- Uncapped domains are still counted. The only difference is that the comparison is skipped.
- Only the operator changes `dailyLimit` (5.10). The portal shows it read-only.
- The operator can also **suspend** a domain: an immediate stop that does not touch DNS state or
  the cap. This is the response to an anomaly alert.
- A stop also holds mail already queued **(call)**. When ZoneMTA takes a message from its queue,
  the plugin checks that the domain is still `verified`, not suspended, and under an active
  licence. If not, that attempt is deferred without contacting the recipient's server. Held mail
  goes out when the domain may send again. Mail still held when ZoneMTA's queue lifetime ends
  bounces like any other and is counted as `bounced{category="held"}`. A removed domain is
  treated the same way: its queued mail is held until it expires.

### 5.6 ZoneMTA and the plugin

A new `mta/` directory holds a `package.json` pinning `zone-mta`, its config, a Dockerfile and
`plugins/hidemail-outbound.js`. The plugin:

- `message:headers`: reads the `X-HM-Message-Id` and `X-HM-Domain` headers the backend set, keeps
  them in the envelope, and removes them from the message.
- `sender:fetch`: applies the hold rule in 5.5 by returning a temporary error.
- `sender:connection`: fetches and decrypts the domain's private key (cached briefly) and attaches
  it, so every message is signed with `d=<domain>` at the last hop.
- `log:entry` and `queue:bounce`: appends `{ messageId, domain, type, response, at }` to the
  Redis stream. `type` is `delivered`, `deferred`, `held`, or `bounced`.

Compose adds `zonemta` and `mongo`. Postfix and the forwarding path are unchanged. ZoneMTA runs
on a bridge network with a fixed container address and sends from whatever public address the
host gives that container: the host's default address as Postfix does today, or a dedicated one
through a single source-NAT rule on the host, documented in `deploy/README.md`. ZoneMTA itself
is configured only with the HELO name (`OUTBOUND_HELO_HOSTNAME`), so the code and compose file
are the same for both.

### 5.7 Events and suppression

- The backend consumer updates the message record and the per-domain counters, then acknowledges.
  Applying an event twice must not double count.
- A bounce response is classified with the existing Bounce Read catalogue. A permanent failure
  that says the address does not exist adds the recipient to the account's suppression list with
  reason `hard_bounce`. Policy or reputation refusals are counted but never suppress, because they
  describe us, not the address.
- Suppression is per account, across its domains. Reasons: `hard_bounce`, `manual`, and later
  `complaint`. Removing an entry is allowed and logged.
- Bounce mail that arrives later at `hm-bounce.<domain>` is accepted by the existing inbound
  listener, parsed by Bounce Read, matched to the message through the `b-<id>` address, and fed
  into the same path (milestone 3).

### 5.8 Metrics, dashboard, alerts

Counts are kept in Redis per domain and rendered from there, so they survive redeploys and both
audiences read the same numbers.

| Series | Labels | Meaning |
|---|---|---|
| `hidemail_outbound_accepted_total` | `domain` | Messages accepted by the API |
| `hidemail_outbound_delivered_total` | `domain` | Accepted by the recipient's server |
| `hidemail_outbound_deferred_total` | `domain` | Temporary failures (each attempt) |
| `hidemail_outbound_held_total` | `domain` | Attempts skipped because the domain may not send |
| `hidemail_outbound_bounced_total` | `domain`, `category` | Permanent failures: `unknown_recipient`, `mailbox`, `policy`, `reputation`, `held`, `other` |
| `hidemail_outbound_rejected_total` | `domain`, `reason` | Refused by the API: `invalid_recipient`, `suppressed`, `daily_limit`, `rate_limit`, `domain_not_verified`, `domain_suspended` |
| `hidemail_outbound_suppressions` | `reason` | Current suppression list size |
| `hidemail_outbound_daily_sent` | `domain` | Count for the current UTC day |
| `hidemail_outbound_daily_limit` | `domain` | The cap; `+Inf` when there is none |
| `hidemail_outbound_domain_verified` | `domain` | 1 or 0 |
| `hidemail_outbound_queued` | `domain` | Accepted and not yet delivered or bounced |

Delivery rate is `delivered / accepted`; invalid addresses are
`rejected{reason="invalid_recipient"}` plus `bounced{category="unknown_recipient"}`.

- **Customer scrape**: `GET https://send.hide-mail.org/api/outbound/metrics` with
  `Authorization: Bearer hm_metrics_...`
  returns these series for that account's domains only. The portal shows the token and a ready
  `scrape_config`. This is the per-customer exporter; it is an endpoint, not a process per
  customer **(call)**.
- **Operator**: the existing `:9001/metrics` gains the same series for every domain, plus
  `account` as a label, DNS-check outcome counters, event-consumer lag, and the health of the
  operator's own DNS records. ZoneMTA's `zonemta_*` metrics are scraped alongside.
- `grafana/hidemail-outbound-dashboard.json`: per-domain volume, delivery, deferral and bounce
  rates, cap usage, suppression growth, queue depth and age, DNS state.
- `grafana/hidemail-outbound-alerts.yml` in Prometheus rule format **(call)**. Rules are per
  domain and apply whatever the cap:
  - bounce rate above 5% over an hour, with a volume floor
  - deferral rate above 20% over 30 minutes
  - accepted volume in the last hour above three times the same hour's seven-day average, with a floor
  - new suppressions per hour above a threshold
  - verified domain turned `broken`; operator DNS records failing
  - queue depth or oldest message age above a threshold
  - events not being consumed while the queue is not empty; ZoneMTA or MongoDB down
  - sending IP reported blacklisted by ZoneMTA
  - capped domain above 90% of its cap

  Thresholds are named values at the top of the file.

### 5.9 Portal

A new `portal/` app: Vite, React 18, TypeScript strict, react-router 6, styled-components 6,
following mailduck's `frontend-vite-app` template. Served at `https://send.hide-mail.org` from its
own image **(call)**: a separate origin keeps a key that can send mail away from the ad scripts
on the public site. The look follows the mailduck design system: its colour, spacing and type
tokens in light and dark, and the admin layout (260 px side menu, rail on tablets, sheet on
phones).

The design-system source is copied into `portal/src/design-system/` from
`@mailduck/design-system` 0.1.2: tokens, theme, and only the components the portal uses. The
product owner chose this knowing the copied source becomes public with this repository. The
directory records the version it was copied from. Webmail-only components are not copied.

Pages: Unlock (paste licence key), Overview, Domains, Activity, Suppressions, API keys, Metrics.

```
┌ Send ────────┬────────────────────────────────────────────────────────────┐
│ Overview     │ Domains › mail.example.com               ● Pending         │
│ Domains    ● │ Plan: 5,000 per day                                        │
│ Activity     │                                                            │
│ Suppressions │ Publish these records, then check.                         │
│ API keys     │ ┌──────┬──────────────────────────┬───────────────┬──────┐ │
│ Metrics      │ │ TXT  │ hm-4f2a._domainkey.mail… │ v=DKIM1; k=r… │ ✓    │ │
│              │ │ CNAME│ hm-bounce.mail…          │ rp.hide-mail… │ ✗    │ │
│              │ │ TXT  │ _dmarc.example.com       │ (yours)       │ ✓    │ │
│              │ └──────┴──────────────────────────┴───────────────┴──────┘ │
│              │ hm-bounce: ns1.example.net returned nothing                │
│              │                                          [ Check DNS ]     │
└──────────────┴────────────────────────────────────────────────────────────┘
```

Overview shows today's count against the cap (or "No daily cap"), delivered, deferred and bounced
for 24 hours and 7 days, and each domain's state. Activity lists recent messages with status and
the remote server's last response.

### 5.10 Operator controls

A script run on the host, `docker compose exec backend node scripts/outbound-admin.js …`
(decided by the product owner):

- `account create --name <label> --days <n>` prints the licence key once
- `account extend`, `account list`
- `domain limit --domain <name> --daily <n>` and `domain limit --domain <name> --unlimited`
- `domain suspend`, `domain resume`
- `account rate --account <id> --per-minute <n>`

No operator endpoint is exposed over HTTP in this design.

### 5.11 Deploy, CI, security routine

- CI builds, tests and publishes `mta` and `portal` images next to `frontend` and `backend`; the
  autodeploy health check covers the new containers.
- Host nginx gains a `send.hide-mail.org` server block and certificate, proxying `/` to the
  portal container and `/api/outbound/` to the backend. The `hide-mail.org` block refuses
  `/api/outbound/`.
- `mta/` and `portal/` become the third and fourth dependency trees. `security-audit.yml`, the
  `security-maintainer` skill and `.cursor/rules/dependencies.mdc` are extended to cover them.
- `README.md` and `.env.example` document the product and every new variable.

## 6. Build order

0. **Spike: ZoneMTA under the audit gate.** Find the smallest override set that passes
   `npm audit --audit-level=high` in `mta/`. With it, prove against a local test receiver that
   ZoneMTA queues, signs and delivers a message, and that a message for a domain that may not send
   is deferred without a delivery attempt. If either fails, stop and return to the product owner.
   The two `request` alerts do not fail the spike: they are dismissed in GitHub as tolerated,
   with the reason recorded there and in `.cursor/rules/dependencies.mdc` (no patched version
   exists; reached only through HTTP-upload delivery, which is not configured). Any other
   advisory at any severity does fail it.
1. **Sending core.** Account and licence, send keys, domains with DNS verification, send API,
   caps, ZoneMTA with the plugin, event consumer, suppression, operator script.
2. **Metrics.** Customer scrape endpoint, operator series, dashboard, alert rules.
3. **Bounce mail-back.** Late bounces through the inbound listener.
4. **Portal.**

Each milestone is test-first, as the repo already works. Milestones 1 to 4 ship before the first
customer goes live.

## 7. Go-live prerequisites (operator, outside the code)

- A sending IP with matching forward and reverse DNS for the HELO name. Today the host's address
  also carries a disposable-inbox service and its forwarding relay; sending invoices from a
  dedicated address is strongly preferable. A dedicated address needs the source-NAT rule in 5.6;
  the shared one needs nothing.
- `rp.hide-mail.org` (MX and SPF) and `send.hide-mail.org` (A/AAAA and certificate) published.
- Prometheus rules loaded and routed to wherever alerts are read.
- Host capacity for MongoDB and ZoneMTA.

## 8. Left to the builder

Redis key layout and retention mechanics; how idempotent event application is implemented; the
DNS zone-cut walk; the encryption format for stored keys; module boundaries under
`backend/services/outbound/` (small files, one concern each); portal component breakdown; exact
dashboard panels and alert thresholds; ZoneMTA zone tuning (connections, retry schedule).

## 9. Later phases, each with its own short design

Link branding and click tracking (needs certificates for customer hostnames); complaint
ingestion (reuses Complaint Read); templates and batch sends; self-serve plans and checkout;
SMTP submission.

## 10. Decisions taken by the product owner

1. Product shape A; ZoneMTA with one plugin; licence keys, no accounts.
2. DNS records are generated and confirmed on the domain's nameservers before a domain may send.
3. The operator can set a domain to no daily cap; dashboards and alerts apply regardless.
4. The two `request` alerts in the ZoneMTA tree are dismissed with a recorded reason.
5. Design-system components are copied into this repo.
6. Operator actions are a host script, with no privileged HTTP endpoint.
