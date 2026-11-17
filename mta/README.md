# mta

Spike tree for [ZoneMTA](https://github.com/zone-eu/zone-mta) (pinned `3.10.3`), the outbound MTA for Hide Mail Send. It is an independent npm package, separate from the repo root and `backend/`, and requires Node >=24 for host-side `npm`/`jest` commands. Transitive vulnerabilities are fixed through `overrides` in `package.json`; audit it with `(cd mta && npm audit --audit-level=high)`, which must exit 0. Only the moderate `request` / `zone-mta` advisories (no patched version upstream) are tolerated; see `.cursor/rules/dependencies.mdc`.

**Node version: two different requirements, do not conflate them.** `package.json`'s `engines: ">=24.0.0"` and the "Node >=24" above govern *host tooling only* - running `npm install`/`npm test`/`npm audit` for this package (confirmed working on Node v26.13.0). **The ZoneMTA process itself has a hard ceiling at Node 22** - confirmed working through Node 22, confirmed broken on Node 24+ - because `zone-mta`'s dependency chain (`restify` → `spdy` → `http-deceiver`) calls the legacy `process.binding('http_parser')` API, which Node 24 removes outright (`Error: No such module: http_parser`). This is why `mta/Dockerfile` pins `node:22-bookworm-slim` for the actual ZoneMTA runtime image - and it is **not a Docker-specific issue**: running `node node_modules/zone-mta/app.js` directly on a bare host with Node 24+ would crash the exact same way. See `task-3-report.md` for the full finding.

When dismissing these alerts in Dependabot after merge, use: *"no patched version; ZoneMTA reaches `request` only for HTTP-upload delivery, which is not configured"*.

## Dependency patch: `request`'s `uuid/v4` import

`request` (a transitive dep of `zone-mta`, loaded unconditionally by `lib/sender.js`) does `require('uuid/v4')`. The audit-fixing `uuid` override above (`^11.1.1`, required to clear GHSA-w5hq-g745-h8pq) dropped that legacy subpath from `uuid`'s `exports` map - it has been gone since `uuid@8`, so no version satisfying the override can restore it. Without a fix, every ZoneMTA sender child process crash-loops on boot with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

Fixed via [`patch-package`](https://www.npmjs.com/package/patch-package) (`patches/request+2.88.2.patch`, applied by the `postinstall` script): `request`'s `lib/{auth,multipart,oauth}.js` now do `require('uuid').v4` instead. This does not touch the `overrides` block or change the audit result - run `npm audit --audit-level=high` after `npm install` to confirm it's still exactly the 2 tolerated moderates.

The patch filename pins the exact resolved `request` version (`2.88.2`); if a future `package-lock.json` regen ever resolves a different `request` version, `patch-package` will fail loudly at `npm install` time (not silently skip), and the patch must be regenerated (`npx patch-package request`) and renamed to match.

## M0 ZoneMTA spike: deliver/hold proof

Generate the throwaway DKIM key (not committed; see `testdata/.gitignore`), bring up the spike stack, and run the integration tests:

```bash
export PATH="$HOME/.nvm/versions/node/v26.13.0/bin:$PATH"   # Node >=24 required

node mta/scripts/generate-spike-dkim.js

docker compose -f docker-compose.yml -f mta/docker-compose.spike.yml \
  --profile spike up -d --build redis mongo zonemta

ZONEMTA_SPIKE=1 npm test --prefix mta -- tests/integration/deliver-and-hold.test.js

docker compose -f docker-compose.yml -f mta/docker-compose.spike.yml \
  --profile spike down -v
```

Without `ZONEMTA_SPIKE=1`, `npm test --prefix mta` skips the integration suite (plain `npm test` / unit tests under `tests/plugins/` are unaffected and always run). The spike's ZoneMTA feeder (`127.0.0.1:2526`) and API (`127.0.0.1:12080`) ports are published loopback-only; `mta/docker-compose.spike.yml` also temporarily publishes the root `redis` service on `127.0.0.1:6379` (gated behind the same `spike` profile override) so the test can set/clear gate keys from the host. See `.superpowers/sdd/2026-11-17-outbound-send-m0-zonemta-spike/task-3-report.md` for the full spike findings.

**Gate record (M1+):** the plugin reads `outbound:domain:gate:<domain>` as JSON `{ maySend, selector, privateKeyEnc }` (not the M0 `outbound:spike:domain:*` `"1"`/`"0"` string). `maySend !== true` (or a missing key) defers with `451 Domain held`. DKIM signing decrypts `privateKeyEnc` with `OUTBOUND_KEY_ENCRYPTION_SECRET` — that secret must match the backend's. Delivery outcomes are written to Redis Stream `outbound:events`.

## Production deployment

Production `mta/config/zonemta.js` delivers to real recipient MX (no smarthost). Set `OUTBOUND_KEY_ENCRYPTION_SECRET` identically on backend and zonemta, `PLUGIN_REDIS_URL=redis://redis:6379/0` (product Redis db 0), and `OUTBOUND_HELO_HOSTNAME` for the EHLO name (wired via `pools.default[].name`). The root `docker-compose.yml` runs permanent `zonemta` + `mongo` services alongside backend; keep `mta/docker-compose.spike.yml` for local fake-receiver testing only.
