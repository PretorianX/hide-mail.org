# ZoneMTA spike image for Hide Mail Send's M0 outbound MTA proof.
#
# zone-mta is used as an npm dependency (not as the app root), so its own
# plugin loader (@zone-eu/wild-plugins) always resolves "core/*" plugins
# relative to process.cwd(). The final WORKDIR below is therefore set to
# node_modules/zone-mta itself so that lookup lands on its bundled
# plugins/core directory; our own plugin is found via the absolute
# `pluginsPath` set in config/zonemta.js instead.
#
# Pinned to Node 22, NOT the >=24 required by package.json's `engines` (that
# field documents the HOST tooling requirement for npm/jest - see mta/README.md).
# Spike finding: zone-mta's API server (restify -> spdy -> http-deceiver)
# calls the legacy `process.binding('http_parser')` API, which Node 24
# removes outright ("No such module: http_parser"); Node 22 still exposes it
# (DEP0111 deprecation warning only). Confirmed empirically against node:18/
# 20/22-bookworm-slim (all OK) vs node:24-bookworm-slim (crashes on boot).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# patches/ must be present before `npm ci` runs: its postinstall script
# (patch-package) fixes a Task 3 integration finding - zone-mta's own
# `request` dependency does `require('uuid/v4')`, a deep subpath removed by
# uuid's "exports" map ever since uuid@8 (and required to stay >=11.1.1 by
# the audit-fixing override above). Without this patch the sender process
# crash-loops on boot. See mta/README.md and task-3-report.md for the finding.
COPY patches ./patches
# npm 10 (bundled with node:22) disagrees with how npm 11 (the host's pinned
# Node v26.13.0 toolchain, which generated package-lock.json) resolved the
# nested `overrides.jest.{glob,minimatch}` block, so `npm ci` rejects the
# lockfile as out of sync. Install the matching npm major first.
#
# Full `npm ci` (not --omit=dev): the postinstall script needs the
# patch-package devDependency to be present to apply patches/ above. Pruning
# devDependencies afterwards would be a worthwhile size optimization beyond
# this spike, not required to prove deliver/hold.
RUN npm install -g npm@11.20.0 && npm ci

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY plugins ./plugins
COPY config ./config

# DKIM key (mta/testdata/dkim.pem) is generated locally by
# scripts/generate-spike-dkim.js and is NOT baked into the image - it is
# bind-mounted at runtime by docker-compose.spike.yml.

# Feeder SMTP + API ports. Published loopback-only by the compose file;
# EXPOSE here is documentation, not a security boundary.
EXPOSE 2526 12080

WORKDIR /app/node_modules/zone-mta
CMD ["node", "app.js", "--config=/app/config/zonemta.js"]
