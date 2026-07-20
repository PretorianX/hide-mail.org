---
name: security-maintainer
description: Check Dependabot alerts and npm audit, bump vulnerable packages via npm overrides, run tests, and remind about prod redeploy. Use when the user asks to check vulnerabilities, Dependabot, npm audit, security advisories, or dependency bumps for hide-mail.org.
---

# Security maintainer

## Steps

1. List open Dependabot alerts:
   ```bash
   gh api --paginate repos/PretorianX/hide-mail.org/dependabot/alerts \
     --jq '[.[] | select(.state=="open")] | .[] | {number, package: .security_vulnerability.package.name, severity: .security_advisory.severity, patched: .security_vulnerability.first_patched_version.identifier, path: .dependency.manifest_path}'
   ```
2. Run audits in both trees:
   ```bash
   npm audit
   (cd backend && npm audit)
   ```
3. Fix with `overrides` in `package.json` and/or `backend/package.json`, then `npm install` in each tree.
4. Verify:
   ```bash
   npm test
   (cd backend && npm test -- --forceExit)
   npm audit --audit-level=high
   (cd backend && npm audit --audit-level=high)
   ```
5. Conventional commit, e.g. `fix(deps): resolve Dependabot advisories`.
6. After push to `main`, CI publishes GHCR `:latest` and opens/updates the **Redeploy production** issue (emails assignee). Remind the user to run on prod:
   ```bash
   docker compose pull && docker compose up -d
   ```
   then close the redeploy issue.

## Hard rules

- Prefer npm `overrides` for transitive vulns; do not invent fallbacks.
- Root: pin `js-yaml@3` and `js-yaml@4` separately (do not force all to 4.x).
- Backend `uuid` stays on **11.x** (CommonJS `require('uuid')`). Do not merge uuid 12+/14 Dependabot PRs.
- Do not edit `changelog.md`.
- Do not claim alerts are fixed until they show `state: fixed` on GitHub after push.
