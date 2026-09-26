# Inbox slots — several live inboxes at the same time

## The user problem

Hide Mail holds exactly one inbox. `EmailService.generateEmail()` calls
`deactivateCurrentEmail()` before it registers the new address, which drops the Redis lease and
takes every message in it with it. So the moment you need a second throwaway address — a second
account on the same site, an invite you have to accept from another address, a newsletter
confirmation you are still waiting on — you have to destroy the inbox you are already using.
There is no way back: the lease is gone and `known_mailbox:*` only keeps the address from
bouncing, it does not restore anything.

Every serious competitor treats this as the headline reason to pay:

- temp-mail.org's Premium terms list **"Multiple mailboxes — access to up to 10 mailboxes at the
  same time. You will be able to switch between them or delete them as you wish"** as the *first*
  of eight premium bullets, at $10/month. Their free tier answers a second attempt with
  "Too many new mailboxes created. Upgrade to Premium or try again later."
- 2TempMail ships the same wording at the same price.
- The Temp Mail iOS app: "Free users can have up to 1 active mailbox, while PRO users have access
  to up to 10 mailboxes."

Hide Mail is behind the *free* tier of those products, because it does not merely cap the second
inbox, it deletes the first one.

## What is built

**Inbox slots.** A browser holds an *inbox group*, and a group can hold several live mailboxes at
once. The home page grows a strip of inbox chips above the address: one per live inbox, with the
time it has left, a click to switch to it, and an × to release it. A `+ New inbox` button opens
another one **without touching the inbox you are already reading**.

- Free: **2 inboxes at once**.
- Pro and API: **10 inboxes at once**.

`Change Email Address` keeps its current meaning — it replaces the inbox you are looking at. It is
now a different action from opening an extra one.

### Why it is a new capability, not an extension

The product cannot do this at all today, and nothing in the codebase is half-built towards it.
There is a single `currentEmail` string in `EmailService`, a single `mailduck_current_email`
localStorage key, and a registration path whose first act is to deactivate whatever came before.
No Redis structure groups mailboxes; `active_mailbox:*` is a flat set of independent leases with
no notion of an owner. The server had no way to answer "which inboxes does this visitor have
open", and there was no client state that could hold more than one.

The strip on the home page is the *surface* for the new capability, not the capability itself —
the substance is the group primitive in Redis, the entitlement that sizes it, and the
registration path that no longer destroys the previous lease.

### Why it can attract money

It is the single most-sold temporary-mail upgrade in the market, and Hide Mail Pro costs $3.49
against temp-mail.org's $10. The free allowance of 2 is deliberately enough to *prove the idea
works* and immediately not enough for the people who need it — a QA tester checking an invite
flow, or anyone running more than a couple of signups. Hitting the limit is the first moment in
Hide Mail where a free user wants something specific that Pro has, expressed as a number they
can see.

It also protects retention: today the only way to get a second address throws away the first,
which is a reason to leave the page.

**Success metric.** Share of sessions that open a second inbox, and the conversion rate of
visitors who see the `SLOT_LIMIT` notice into `/pro` visits. Backing counters:
`hidemail_inbox_slots_opened_total{result="opened"|"limit"}` and
`hidemail_inbox_slots_released_total`.

## Core user flow

1. First visit registers an inbox as it always did, and the browser asks the API for an inbox
   group id (`POST /api/mailbox/slots/group`), which it keeps in
   `localStorage.hidemail_inbox_group`.
2. The chip strip shows one inbox. `+ New inbox` registers a second address in the same group;
   the first one stays live and keeps receiving.
3. Clicking a chip switches the inbox view to that address. The countdown and the message list
   follow the selected inbox.
4. × releases an inbox: the mailbox is deactivated and the slot is freed.
5. On a free plan the third `+ New inbox` is answered with `403 SLOT_LIMIT` and the strip explains
   that free keeps 2 at once while Pro keeps 10, next to the existing Pro call to action.

### How to try it on a free account

The capability ships free. Open the home page, press `+ New inbox`, send mail to both addresses,
and switch between them — no licence key involved. The free allowance of 2 is the demo.

## Shape of the implementation

Backend:

- `backend/utils/inboxGroupId.js` — pure. Group ids are 32 lowercase hex characters (128 bits)
  minted by `crypto.randomBytes`, so one browser cannot guess another's group.
- `backend/services/inboxSlotService.js` — the group is a Redis **sorted set**
  `inbox_slots:{groupId}`, member = address, score = the millisecond it was opened, which gives the
  strip a stable order. Membership is pruned against `active_mailbox:*` on every read, so an
  expired inbox leaves the strip by itself. The key expires with the longest-lived member plus
  the mailbox cleanup grace, so dead groups collect themselves.
- `backend/controllers/inboxSlotController.js` and three routes:
  `POST /api/mailbox/slots/group`, `GET /api/mailbox/slots`, `DELETE /api/mailbox/slots/:email`.
  The group travels in an `X-Inbox-Group` header, the same way a licence travels in
  `X-License-Key`. New rate-limit bucket `inboxSlots`, 30 per minute.
- `emailController.registerMailbox` claims the slot **before** it registers the lease, so a
  refused registration can never leave an orphan mailbox behind. A claimed slot whose
  registration then fails is pruned on the next read.
- `entitlementService` gains `inboxSlots`, from `config.inboxSlots.{freeLimit,proLimit}`.

Frontend:

- `src/services/InboxGroupService.js` holds the group id; `src/services/InboxSlotService.js`
  lists and releases slots.
- `EmailService` grows `openAdditionalMailbox()`, `switchTo()` and `releaseMailbox()`.
  `generateEmail()` is unchanged in meaning: it still replaces the active inbox.
- `src/components/InboxSlots.js` is the chip strip.

### Out of scope

- Per-chip unread counts. That would mean polling every open inbox every three seconds; the strip
  shows remaining lifetime instead.
- Reading two inboxes side by side. One is selected at a time.
- Restoring a group on another device. The group id is browser-local on purpose — a cross-device
  restore path is a separate feature.
- Raising the per-IP registration rate limit. Ten registrations a minute already covers ten slots.

### What the slot limit is, and is not

It is an allowance, not a security boundary. A visitor who clears localStorage, or opens a second
browser, gets a fresh group — exactly as they can today, since free mailboxes have always been
unlimited and unauthenticated. The per-IP `mailboxRegister` limiter is what bounds abuse, and it
is untouched. Slots exist so that the inboxes a visitor *is* using stay alive and countable, and
so the number can be worth paying to raise.
