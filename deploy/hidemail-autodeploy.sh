#!/usr/bin/env bash
#
# Runs the images CI publishes. GHCR holds the :latest tags the prod compose file refers to, so
# this pulls them and lets compose recreate only the containers whose image actually moved.
#
# There is deliberately no rollback: a failed health check leaves the unit in a failed state and
# the details in the journal, because a machine guessing which version to restore is worse than a
# person reading `systemctl status hidemail-autodeploy`.
#
#   journalctl -u hidemail-autodeploy -n 50

set -euo pipefail

COMPOSE_DIR=${COMPOSE_DIR:-/home/www-data/hide-mail.org}
# Host port 3001 belongs to the frontend and 3002 forwards to the backend, so a check aimed at
# 3001/health gets the SPA's index.html with a 200 and passes while the backend is down.
BACKEND_HEALTH_URL=${BACKEND_HEALTH_URL:-http://127.0.0.1:3002/health}
FRONTEND_URL=${FRONTEND_URL:-http://127.0.0.1:3001/}
PORTAL_URL=${PORTAL_URL:-http://127.0.0.1:3001/admin/portal/}

HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-30}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-2}
DEPLOY_MANIFEST=${DEPLOY_MANIFEST:-}
REQUIRE_DIGEST=${REQUIRE_DIGEST:-0}
COSIGN_PUBLIC_KEY=${COSIGN_PUBLIC_KEY:-}
LAST_GOOD_FILE=${LAST_GOOD_FILE:-${COMPOSE_DIR}/.last-good-images.env}
SERVICES=(backend frontend portal)

cd "$COMPOSE_DIR"

load_manifest() {
  local manifest="$1"
  if [ ! -f "$manifest" ]; then
    echo "Deploy manifest not found: $manifest" >&2
    exit 1
  fi
  # Only allow explicit image variables from the controlled manifest.
  while IFS='=' read -r key val; do
    case "$key" in
      BACKEND_IMAGE|FRONTEND_IMAGE|PORTAL_IMAGE)
        val="${val%\"}"
        val="${val#\"}"
        export "${key}=${val}"
        ;;
    esac
  done < "$manifest"
}

verify_digest_ref() {
  local name="$1"
  local ref="$2"
  if [[ ! "$ref" =~ @sha256:[a-f0-9]{64}$ ]]; then
    echo "Refusing mutable image ref for ${name}: ${ref} (expected @sha256:<64-hex>)" >&2
    exit 1
  fi
  if [ -n "$COSIGN_PUBLIC_KEY" ]; then
    cosign verify --key "$COSIGN_PUBLIC_KEY" "$ref" > /dev/null
  fi
}

if [ -n "$DEPLOY_MANIFEST" ]; then
  load_manifest "$DEPLOY_MANIFEST"
  REQUIRE_DIGEST=1
fi

if [ "$REQUIRE_DIGEST" = "1" ]; then
  verify_digest_ref "backend" "${BACKEND_IMAGE:-}"
  verify_digest_ref "frontend" "${FRONTEND_IMAGE:-}"
  verify_digest_ref "portal" "${PORTAL_IMAGE:-}"
fi

# The image a service is running right now, which is what a pull leaves untouched until the
# container is recreated. Reported as "none" while a service is down, so a stopped container reads
# as a change and gets started.
running_images() {
  local service container
  for service in "${SERVICES[@]}"; do
    container=$(docker compose ps --quiet "$service")
    if [ -n "$container" ]; then
      printf '%s %s\n' "$service" "$(docker inspect --format '{{.Image}}' "$container")"
    else
      printf '%s none\n' "$service"
    fi
  done
}

before=$(running_images)

docker compose pull --quiet "${SERVICES[@]}"
docker compose up -d "${SERVICES[@]}"

after=$(running_images)

deployed=no
if [ "$before" = "$after" ]; then
  echo "Already running the published images, nothing to deploy."
else
  deployed=yes
  while read -r service image; do
    previous=$(printf '%s\n' "$before" | awk -v s="$service" '$1 == s { print $2 }')
    if [ "$previous" != "$image" ]; then
      echo "Deployed ${service}: ${previous} -> ${image}"
    fi
  done <<< "$after"
fi

# Both services are checked, and the backend has to say so in its body: matching only a status code
# would accept any process answering on the port.
healthy() {
  curl -fsS --max-time 5 "$BACKEND_HEALTH_URL" | grep -q '"status":"ok"' \
    && curl -fsS --max-time 5 -o /dev/null "$FRONTEND_URL" \
    && curl -fsS --max-time 5 -o /dev/null "$PORTAL_URL"
}

# Checked on every run, not only after a deploy. A failed deploy leaves the unit failed and the
# containers broken, and the next run finds the same image IDs; exiting early on "no change" would
# report success and erase the only lasting sign that production is down.
for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if healthy; then
    echo "Health check passed after ${attempt} attempt(s)."
    if [ "$deployed" = yes ]; then
      printf 'BACKEND_IMAGE=%s\nFRONTEND_IMAGE=%s\nPORTAL_IMAGE=%s\n' \
        "${BACKEND_IMAGE:-ghcr.io/pretorianx/hide-mail.org/backend:latest}" \
        "${FRONTEND_IMAGE:-ghcr.io/pretorianx/hide-mail.org/frontend:latest}" \
        "${PORTAL_IMAGE:-ghcr.io/pretorianx/hide-mail.org/portal:latest}" > "$LAST_GOOD_FILE"
      docker image prune --force --filter 'until=168h' > /dev/null
    fi
    exit 0
  fi
  sleep "$HEALTH_INTERVAL"
done

echo "Health check still failing after $((HEALTH_ATTEMPTS * HEALTH_INTERVAL))s:" >&2
echo "  backend  ${BACKEND_HEALTH_URL}" >&2
echo "  frontend ${FRONTEND_URL}" >&2
exit 1
