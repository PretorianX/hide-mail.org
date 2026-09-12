# Inbox restore key

## User problem

A Hide Mail inbox only exists in one browser. The address, its expiry and nothing else live in
`localStorage` under `mailduck_current_email`; the mailbox itself and every message sit in Redis
until the mailbox TTL runs out. Those two lifetimes are not connected, so the mailbox routinely
outlives the only pointer to it:

- You paste the address into a signup form on the laptop, and the code has to be read on the
  phone. There is no way to open that inbox on the phone.
- You clear site data, use a private window, or the mobile browser evicts the tab. The address is
  gone even though it is still accepting mail.
- A Pro mailbox is bought precisely so it lives 24 hours, 7 days or 30 days. Come back on another
  machine to re-verify with the same address a week later and the product cannot tell you what
  the address was.

The only cross-device mechanism in the product today is `handoffToken`, and that hands over a
*licence key* after a WayForPay payment. Nothing hands over a mailbox.

## What gets built

A server-issued **restore key** per mailbox — a short, typeable code that reopens the mailbox
anywhere until the mailbox expires.

- A `Reopen this inbox anywhere` panel under the address on the home page. It issues a key of the
  form `HMR-4F7K-2QMT-9XB3`, shows it with a copy button next to a
  `https://hide-mail.org/restore?key=…` link, states when it expires, and offers `New key`
  (rotate) and `Forget key` (revoke).
- A `/restore` page: paste the key, or arrive through the link and have it prefilled. Redeeming
  adopts the mailbox in this browser — address, remaining lifetime and all messages already
  stored — and drops you on the inbox.
- The key's lifetime is the mailbox's lifetime. Extending the mailbox extends the key;
  deactivating or changing the address revokes it. One live key per mailbox, rotatable.

### Backend

| Piece | Path |
| --- | --- |
| Code alphabet, formatting, normalisation, validation | `backend/utils/restoreKeyCodec.js` |
| Redis issue / resolve / revoke / TTL sync | `backend/services/restoreKeyService.js` |
| HTTP handlers | `backend/controllers/restoreKeyController.js` |

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/mailbox/restore-key` | Issue the key for an active mailbox, or rotate it |
| `POST` | `/api/mailbox/restore` | Redeem a key, answer with the address and its remaining TTL |
| `DELETE` | `/api/mailbox/restore-key` | Revoke the key |

Redis gains `mailbox_restore:{key}` → address and the reverse index
`mailbox_restore_key:{address}` → key, both carrying the mailbox TTL. Counters
`hidemail_restore_keys_issued_total` and `hidemail_restore_keys_redeemed_total{result}` make the
success metric observable.

### Frontend

`src/services/RestoreKeyService.js`, `src/components/RestoreKeyPanel.js`,
`src/pages/RestoreInbox.js`, and `EmailService.adoptMailbox()` so a redeemed address becomes the
current mailbox exactly as a freshly generated one does.

## Why this is a new capability, not an extension

There is no cross-device, cross-browser or come-back-later surface anywhere in the product: no
accounts, no export, no import, no restore, no QR, no saved inboxes. This adds a new page, three
new endpoints, two new Redis key families and a new client service. The nearest existing thing —
the post-payment `handoffToken` — transfers a licence, never a mailbox, and cannot be extended to
do so.

## Why it can attract money

Free addresses live 30 minutes, so for a free user the key is a device hop: laptop to phone,
right now. The job people actually pay for is the durable one — *reopen the address I signed up
with, later* — and that only works when the mailbox itself is still alive, which is exactly what
Pro sells (24 hours / 7 days / 30 days). Until now a Pro buyer got a long-lived mailbox with no
way to reach it from a second device, which made the longest TTLs hard to justify. The panel
states the key's real expiry, so a free user meets the 30-minute ceiling at the moment they care
about it, with the Pro lifetimes one link away.

Retention: an inbox you can come back to is an inbox you come back to. Trust: "your address is
recoverable" answers the loudest complaint about disposable mail, that everything vanishes.

## Success metric

- Redemption rate: `hidemail_restore_keys_redeemed_total{result="ok"}` over
  `hidemail_restore_keys_issued_total`. Target ≥ 25%.
- Share of `/pro` visits that arrive from the restore panel's lifetime link. Target ≥ 5% of Pro
  page views.

## Core user flow

1. Home page, free or Pro. Under the address, press `Get a restore key`.
2. `HMR-4F7K-2QMT-9XB3` appears with its expiry and a copy button.
3. Open `https://hide-mail.org/restore` in any other browser, phone included, and paste the key.
   Or open the link, which prefills it.
4. `Reopen inbox` → that browser now holds the same address, the same remaining lifetime and the
   messages already delivered to it.
5. `Forget key` when done, or `New key` to invalidate the old one.

## Security

`GET /api/emails/:email` is already unauthenticated: knowing a Hide Mail address is already
enough to read its inbox. A restore key is therefore a typeable handle for a secret the product
already treats this way, not a weaker one. On top of that:

- 12 characters from a 32-symbol alphabet, 60 bits, from `crypto.randomBytes`.
- One live key per mailbox, revocable and rotatable by its holder.
- TTL bound to the mailbox, so a key never outlives the data it points at.
- A dedicated per-IP rate-limit bucket for redemption, 10 attempts per 5 minutes, tighter than
  the general API bucket.
- The key never carries the licence key. Restoring an inbox does not move a Pro entitlement to
  the second device.

## Out of scope

- Accounts, passwords, or any credential other than the key.
- Moving a Pro licence between devices.
- Rendering the key as a QR image. The market leader gives QR away free, so it buys parity, not
  differentiation; the typeable code plus the link is what the flow needs.
- Multiple concurrent mailboxes per browser.
- Two-way sync: read/unread state stays per browser, only the mailbox is shared.
