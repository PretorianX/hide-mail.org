# mta

Spike tree for [ZoneMTA](https://github.com/zone-eu/zone-mta) (pinned `3.10.3`), the outbound MTA for Hide Mail Send. It is an independent npm package, separate from the repo root and `backend/`, and requires Node >=24. Transitive vulnerabilities are fixed through `overrides` in `package.json`; audit it with `(cd mta && npm audit --audit-level=high)`, which must exit 0. Only the moderate `request` / `zone-mta` advisories (no patched version upstream) are tolerated; see `.cursor/rules/dependencies.mdc`.
