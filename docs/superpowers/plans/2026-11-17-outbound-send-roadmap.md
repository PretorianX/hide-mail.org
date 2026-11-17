# Outbound Send — Plan Roadmap

> **For agentic workers:** Execute one plan at a time with
> `superpowers:subagent-driven-development`. Do not start plan N+1 until plan N
> is complete (or, for M0, until the product owner has accepted a FAIL outcome).

**Spec:** `docs/superpowers/specs/2026-11-17-outbound-send-design.md`

| Plan | File | Milestone | Produces |
|------|------|-----------|----------|
| M0 | `2026-11-17-outbound-send-m0-zonemta-spike.md` | Spike | `mta/` tree that audits clean at high, delivers and holds mail locally |
| M1 | `2026-11-17-outbound-send-m1-sending-core.md` | Sending core | Accounts, DNS verify, send API, plugin, events, suppressions, operator script |
| M2 | `2026-11-17-outbound-send-m2-metrics.md` | Metrics | Customer scrape, operator series, Grafana dashboard + alerts |
| M3 | `2026-11-17-outbound-send-m3-bounce-mailback.md` | Bounce mail-back | Late DSN → Bounce Read → same event path |
| M4 | `2026-11-17-outbound-send-m4-portal.md` | Portal | `portal/` at `send.hide-mail.org`, design-system copy, pages |

M1–M4 plan files are written after M0 passes. M0 is the gate: if ZoneMTA cannot
deliver under the audit overrides, stop and return to the product owner before
any other plan is written.
