# Outbound Send — Plan Roadmap

> **For agentic workers:** Execute one plan at a time with
> `superpowers:subagent-driven-development`. Do not start plan N+1 until plan N
> is complete (or, for M0, until the product owner has accepted a FAIL outcome).

**Spec:** `docs/superpowers/specs/2026-11-17-outbound-send-design.md`

| Plan | File | Milestone | Status | Produces |
|------|------|-----------|--------|----------|
| M0 | `2026-11-17-outbound-send-m0-zonemta-spike.md` | Spike | **Done** (PASS — `.superpowers/sdd/m0-controller-summary.md`) | `mta/` tree that audits clean at high, delivers and holds mail locally |
| M1 | `2026-11-17-outbound-send-m1-sending-core.md` | Sending core | **Done** (PASS — `.superpowers/sdd/m1-controller-summary.md`) | Accounts, DNS verify, send API, plugin, events, suppressions, operator script |
| M2 | `2026-11-17-outbound-send-m2-metrics.md` | Metrics | **Done** (PASS — `.superpowers/sdd/m2-controller-summary.md`) | Customer scrape, operator series, Grafana dashboard + alerts |
| M3 | `2026-11-17-outbound-send-m3-bounce-mailback.md` | Bounce mail-back | **Done** (PASS — `.superpowers/sdd/m3-controller-summary.md`) | Late DSN → Bounce Read → same event path |
| M4 | `2026-11-17-outbound-send-m4-portal.md` | Portal | Not started | `portal/` at `send.hide-mail.org`, design-system copy, pages |

M0–M3 are complete. Do not start M4 until the product owner is ready;
M4 plan file is still to be authored (`2026-11-17-outbound-send-m4-portal.md`).
