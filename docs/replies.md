# Reply from your Hide Mail address

## The problem

A temporary inbox is a dead end the moment a human is on the other end of it.

A support agent asks a follow-up question. A marketplace buyer asks whether the item is still
available. A recruiter replies asking which slot works. A signup flow says "reply YES to confirm".
Every one of those conversations dies in a Hide Mail inbox, and the product says so out loud — the
FAQ on `/contact-us` reads:

> **Can I send emails from my temporary address?**
> No, Hide Mail is a receive-only service. You cannot send emails from the temporary addresses.

The only way out is to hand over a real address, which throws away the reason the user came here.

## What this builds

Replying to a message you received, from the Hide Mail address that received it.

Open a message, press **Reply**, type, send. The mail leaves as `From: <your Hide Mail address>`,
carries `In-Reply-To`/`References` so it lands inside the correspondent's existing thread, and the
correspondent's answer comes back into the same Hide Mail inbox. Replies you send are recorded
against the message for as long as the mailbox lives, so you can see what you said.

Replies are **reply-only**: you can write to someone who wrote to you first, and to nobody else.

## Why this is a new capability, not an extension

Hide Mail has exactly one outbound path today, Forward & Forget, and it does the opposite of this
in both directions that matter:

| | Forward & Forget | Reply |
| --- | --- | --- |
| Recipient | the user's own inbox, OTP-proven to be theirs | a third party |
| Sender identity | the service (`SMTP_FROM_EMAIL`, SRS-rewritten) | the user's Hide Mail address |
| Conversation | none; it mails a copy of mail you already have | continues an existing thread |

Nothing in the product sends on a user's behalf to another person, and nothing has ever used a
temporary address as a sender. Sending is not a half-built surface here — it is a documented "no".

## Why it can attract money

- **It is a job people already pay for.** Two-way send/reply sits at #5 in the recurring paid-jobs
  list from the market scan; Guerrilla Mail and EmailOnDeck Pro have it, and temp-mail.org lists
  "Send, reply, forward" as *coming soon* on its own Premium page. The largest player in the market
  has not shipped it.
- **It meters cleanly onto Pro, without a new paywall.** Every free address can send **1** reply, so
  the capability is genuinely usable and testable without paying. Pro raises it to **50** per
  address. That is the same shape as Forward & Forget's 2-vs-100 — a limit on a real capability, not
  an upsell interstitial.
- **It fires at the highest-intent moment in the product.** The user is mid-conversation and
  blocked. That is where willingness to pay peaks, which is why the free reply is deliberately
  spent *before* the prompt appears rather than after.
- **It lifts retention too.** An address you can answer from is an address worth keeping alive, which
  is exactly what the Pro 24h/7d/30d lifetimes sell.

## Success metric

Replies sent per 100 active mailboxes, and the Pro conversion rate of sessions that hit the free
reply limit. Both come off `hidemail_replies_total{result}`, where `result="quota"` is the
limit-reached event and `result="sent"` is a delivered reply.

## Core user flow

1. Generate an inbox on the home page.
2. Receive a message and open it.
3. Press **Reply**. The composer names the correspondent and pre-fills `Re: <subject>`.
4. Type a plain-text reply and send.
5. The reply is confirmed, the remaining count drops, and the sent reply is listed under the message.
6. At zero remaining, the composer states the limit and links to `/pro`.

## Anti-abuse design

A temp-mail service that can send to arbitrary addresses is a spam relay. The recipient is therefore
never accepted from the client:

- The recipient is derived **server-side** from the `From` header of the stored message being replied
  to. A mailbox can only write to an address that has already written to it.
- Exactly one recipient. No CC, no BCC, no reply-all.
- Replies addressed to the service's own domains are refused, the same anti-relay guard Forward &
  Forget applies to its destinations.
- Plain text only, capped at 5 000 characters. No attachments, no HTML.
- CR/LF is stripped from every header value that derives from stored mail, so a crafted `Subject` or
  `Message-ID` cannot inject headers.
- The quota is per mailbox and expires with the mailbox lease; a per-IP bucket sits on top of it.
- The mailbox must be active.

## Out of scope

Composing to an arbitrary address, attachments on replies, HTML composition, CC/BCC, multiple
recipients, reply-all, drafts, editing or recalling a sent reply, and threading across mailboxes.

## Shape of the implementation

Backend:

- `services/replyPolicy.js` — pure rules: recipient extraction, subject/thread headers, body
  validation, quoting. No I/O, so every rule above is a unit test.
- `services/replyStore.js` — the Redis state bound to the mailbox lease: the quota counter and the
  log of sent replies. Both inherit the mailbox TTL.
- `services/replyService.js` — orchestration: entitlement → quota → policy → SMTP → record.
- `controllers/replyController.js` and the routes below.
- `smtpService.sendReply()` — the one new transport call.

```
GET  /api/reply/status/:email             quota, limits and whether replying is possible
GET  /api/reply/:email/:messageId         replies already sent for a message
POST /api/reply/:email/:messageId         send a reply   { body: "..." }
```

Frontend: `services/ReplyService.js` and `components/ReplyComposer.js`, rendered inside the existing
message modal.

## Limits

| | Free | Pro / API |
| --- | --- | --- |
| Replies per address | 1 | 50 |
| Reply length | 5 000 characters | 5 000 characters |

Configurable with `REPLY_FREE_LIMIT`, `REPLY_PRO_LIMIT` and `REPLY_MAX_BODY_CHARS`.

Replies need the same outbound SMTP that Forward & Forget uses (`SMTP_HOST`). When it is not
configured the status endpoint reports `smtpConfigured: false` and the composer says replying is
unavailable rather than pretending to send.
