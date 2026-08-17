# Hide Mail

A temporary email service that provides disposable email addresses for privacy and spam protection.

## Features

- Generate temporary email addresses instantly
- Receive and view emails in real-time
- Select from multiple domains
- Auto-refresh mailbox
- Copy email address to clipboard
- Mobile-friendly responsive design
- Dark/Light theme support
- Optional Hide Mail Pro plan: no ads, longer mailbox lifetimes, custom aliases, premium domains, higher forwarding limits
- Optional API plan for QA automation: create mailboxes, read messages, register inbound webhooks

## Quick Start

### Using Pre-built Images (Recommended)

1. Clone the repository and create your environment file:
   ```bash
   git clone https://github.com/pretorianx/hide-mail.org.git
   cd hide-mail.org
   cp .env.example .env
   ```

2. Edit `.env` with your configuration:
   ```
   VALID_DOMAINS=example.com,mail.example.com
   ```

3. Start the application:
   ```bash
   docker compose up
   ```

4. Access the application:
   - **Frontend**: http://localhost:3001
   - **Backend API**: http://localhost:3002/api
   - **Redis Commander**: http://localhost:8081

### Container Images

Pre-built images are available from GitHub Container Registry:

```bash
docker pull ghcr.io/pretorianx/hide-mail.org/frontend:latest
docker pull ghcr.io/pretorianx/hide-mail.org/backend:latest
```

## Development

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Local Development with Hot-Reload

```bash
docker-compose -f docker-compose-dev.yml up --build
```

This enables hot-reloading for both frontend (`src/`, `public/`) and backend (`backend/`) changes.

## Configuration

### Environment Variables

Key configuration options in `.env`:

| Variable | Description |
|----------|-------------|
| `VALID_DOMAINS` | Comma-separated list of email domains |
| `REACT_APP_ADSENSE_CLIENT` | Google AdSense publisher ID (optional) |
| `WAYFORPAY_MERCHANT_ACCOUNT` | WayForPay merchant login; empty disables paid plans |
| `WAYFORPAY_SECRET_KEY` | WayForPay secret key used to sign and verify payments |
| `WAYFORPAY_SERVICE_URL` | Public HTTPS URL WayForPay posts payment results to |
| `WAYFORPAY_RETURN_URL` | Page the payer is redirected to after payment. WayForPay itself is given `/api/billing/return` on the same origin, because it returns the browser with a POST |
| `PRO_PRICE_MONTHLY_UAH` / `PRO_PRICE_YEARLY_UAH` | Pro prices charged in UAH |
| `API_PRICE_MONTHLY_UAH` | API plan price charged in UAH |
| `PRO_PRICE_*_USD_DISPLAY` / `API_PRICE_MONTHLY_USD_DISPLAY` | Dollar prices shown on the site; display only |
| `PREMIUM_DOMAINS` | Pro-only domains; empty means Pro uses `VALID_DOMAINS` |

See [.env.example](./.env.example) for the full list with comments. For AdSense slot
configuration, see [ADSENSE-SLOTS-CONFIG.md](./ADSENSE-SLOTS-CONFIG.md).

## Hide Mail Pro

Paid plans are optional; the service works fully without any WayForPay configuration. When
`WAYFORPAY_MERCHANT_ACCOUNT` or `WAYFORPAY_SECRET_KEY` is empty, `/api/billing/checkout`
answers `503 PAYMENTS_NOT_CONFIGURED` and the site stays free and ad-supported.

### Prices and currency

WayForPay settles in hryvnia, so the card is always debited the UAH amount. The site leads with
a US dollar price because most visitors are outside Ukraine, and every dollar figure is shown
next to the hryvnia amount that is actually charged. The `*_USD_DISPLAY` values are static: keep
each one slightly above the UAH price converted at the current rate so a shopper is never
charged more than the price they were quoted, and review them when the rate moves.

### How a purchase works

1. The browser posts a plan to `POST /api/billing/checkout`. The backend stores an order in
   Redis with the price for that plan and returns a WayForPay payload signed with HMAC-MD5.
2. The browser posts that payload to WayForPay, which collects the card details. Card data
   never reaches Hide Mail.
3. WayForPay posts the result to `POST /api/billing/webhook`. That callback is a JSON document
   sent with a `application/x-www-form-urlencoded` content type, so the body is read as text
   and decoded as JSON before the generic parsers see it. The signature is verified with a
   timing-safe comparison, and the plan and price are read from the stored order rather
   than from the callback, so a caller cannot claim a plan it did not pay for.
4. The backend issues a license key (`HM-XXXX-XXXX-XXXX-XXXX`) and, for the API plan, an API
   key (`hm_api_...`) valid for `API_KEY_TTL_SECONDS`.
5. WayForPay returns the browser with a POST, which static hosting answers with 405, so the
   payer lands on `/api/billing/return` and is redirected to `WAYFORPAY_RETURN_URL` with the
   order reference. The Pro page exchanges it for the license key, saves the key, and strips
   the reference from the URL. The backend only serves keys for `LICENSE_KEY_HANDOFF_SECONDS`
   after payment.

### No accounts

There is no sign-up. The license key is the only credential: it lives in the browser's local
storage and is sent to `POST /api/billing/license/validate` to unlock entitlements. Users
restore a plan on another browser by pasting the key on `/pro`. That endpoint is rate limited
to 10 requests per 5 minutes per IP, and keys are never written to logs in full.

Recurring charges arrive with a new order reference, so renewals are matched by the WayForPay
`recToken` and extend the existing key instead of issuing a new one. A refund or void revokes
the key.

API keys are deliberately shorter-lived than the plan: they expire after `API_KEY_TTL_SECONDS`
(30 days by default) while an API licence may run for a year, and the post-payment handoff
window closes after an hour. An API subscriber therefore issues a fresh key from their licence
key at any time with `POST /api/billing/license/api-key`, or by pressing the button on `/pro`.
The endpoint shares the licence validation rate limit, since a licence key is its only
credential, and it only ever answers for an active licence of type `api`.

### What a paid plan actually changes

`/pro` renders the free, Pro and API columns from `entitlementService.describeTiers()`, so the
advertised limits are the same numbers the backend enforces. Two of them are easy to misread:

- **Mailbox lifetime.** A free mailbox starts at `EMAIL_EXPIRATION_SECONDS` and is topped up by
  `EMAIL_EXTENSION_SECONDS` per press of the extend button, added to whatever time is left. A
  paid mailbox is created with one of the lifetimes its plan allows and refreshing resets it to
  that value. The countdown always takes the new lifetime from the refresh response, so it can
  never show time the server has not granted.
- **Forward & Forget.** `FORWARDING_FREE_LIMIT` and `FORWARDING_PRO_LIMIT` are enforced per
  mailbox **per hour** by `rateLimiter`, not per mailbox lifetime. The limit is resolved from the
  licence key stored with the mailbox when it was created, so activating Pro does not raise the
  limit on a mailbox generated beforehand.

Ads are suppressed for paying users in two places: the React ad components render nothing, and
`public/adsense-config.js` skips loading the AdSense tag entirely when a licence key is present,
so auto-ads cannot place anything either.

## Monitoring

The backend exposes Prometheus metrics on `METRICS_PORT` (default 9001, bound to `127.0.0.1`
in Docker) at `/metrics`, plus a `/health` endpoint. Import
[grafana/hidemail-dashboard.json](./grafana/hidemail-dashboard.json) for mailbox, SMTP, HTTP,
Forward & Forget, subscription and Node.js runtime panels.

Subscription metrics come in two flavours. Payment events are counters recorded as they
happen:

| Metric | Labels | Meaning |
|---|---|---|
| `hidemail_billing_checkouts_total` | `type`, `plan` | Checkout sessions started |
| `hidemail_billing_webhook_events_total` | `result` | Webhook outcome, including `invalid_signature`, `unknown_order` and `amount_mismatch` |
| `hidemail_billing_revenue_total` | `currency`, `type`, `plan` | Confirmed revenue, booked from the configured plan price rather than the callback amount |
| `hidemail_licenses_created_total` | `type`, `plan` | First payments |
| `hidemail_licenses_renewed_total` | `type`, `plan` | Recurring payments |
| `hidemail_licenses_revoked_total` | `type` | Refunds and chargebacks |
| `hidemail_license_validations_total` | `result` | `active`, `expired` or `not_found` — a spike in `not_found` means key guessing |
| `hidemail_api_key_validations_total` | `result` | Same idea for API keys |

Counters cannot answer "how many people are paying right now", because licenses simply expire
out of Redis. So gauges are recomputed on a timer by scanning the license, API key and order
keys, every `BILLING_METRICS_INTERVAL_SECONDS` (default 60):

| Metric | Labels | Meaning |
|---|---|---|
| `hidemail_licenses_active` | `type`, `plan` | Subscriptions currently active |
| `hidemail_api_keys_active` | — | API keys that have not expired |
| `hidemail_billing_orders` | `status` | Orders still in Redis, `pending` or `paid` |
| `hidemail_billing_collector_last_success_timestamp_seconds` | — | When the gauges were last refreshed |
| `hidemail_billing_collector_errors_total` | — | Failed collections |

Alert on the freshness of the last collection: if `time() -
hidemail_billing_collector_last_success_timestamp_seconds` grows past the interval, the
subscription counts on the dashboard are stale even though the counters keep working.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│    Redis    │
│   (React)   │     │  (Node.js)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ SMTP Server │
                    │ (Haraka)    │
                    └─────────────┘
```

## License

[MIT License](LICENSE)
