# Outbound Activity detail + search

## Goal
Portal Activity shows enough metadata to audit a send (SendGrid-style), without storing message bodies.

## Record fields (new, optional on older rows)
At accept time, `outbound:message:<id>` also stores:
- `subject` (string | null) — amends prior “no subject” rule; still no body
- `from` (`{ name: string | null, email: string }` | null) — header From
- `envelopeFrom` (string | null) — SMTP MAIL FROM `b-<id>@hm-bounce.<domain>`
- `clientIp` (string | null) — `X-Forwarded-For` first hop, else `req.ip`
- `sendKeyName` (string | null) — send-key display name, never raw key/hash

## Auth / send path
`requireSendKey` sets `req.sendKeyName`. Messages controller passes `clientIp` + `sendKeyName` into `sendService.sendMessage`.

## Portal
- Table: Status, Recipient, Subject (truncated), Domain, Updated
- Row click opens right detail drawer with all fields above + last response, reference, ids, timestamps
- Esc / close / backdrop dismisses
- Simple client-side search filters the loaded list by case-insensitive substring across all displayed fields (including drawer fields)

## Non-goals
Server-side search, body retention, raw send-key storage.
