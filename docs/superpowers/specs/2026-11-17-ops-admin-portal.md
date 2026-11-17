# Ops admin portal (MailDuck shell)

## Goal
Operator admin uses the same MailDuck portal shell as Send, with a Licences workspace richer than the customer API-keys page.

## Shell
- `OpsShell`: AdminLayout + Header (“Ops”) + SideMenu (Licences) + Sign out
- `/ops/login` stays outside the shell
- No credential-source copy anywhere in the UI

## Licences page
- Summary: total, active, counts by type
- Search across all licence fields (client-side)
- Type + status filter controls
- Table: Status, Mask, Type, Label, Account, Rate, Daily, Expires, Actions
- Row click → right detail drawer with full record
- Create panel with labeled fields; plaintext shown once on create

## Non-goals
New backend fields, server-side search, extend/suspend APIs.
