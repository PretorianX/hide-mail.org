# Ops Activity logs

## Goal
Ops sees outbound send activity across all accounts, same detail as the customer Activity page, with filters.

## Backend
`GET /api/admin/activity?limit=` (admin session):
- Lists recent messages from every outbound account
- Merges newest-first, caps at min(limit, 500) default 200
- Enriches each row with `accountLabel` from the outbound licence
- Never returns licence plaintext or message bodies

## Portal
- Ops nav: Activity
- Table + right detail drawer (customer Activity fields + account label)
- Filters: search (any field), status, domain, account/label
