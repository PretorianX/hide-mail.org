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
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-30}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-2}
SERVICES=(backend frontend)

cd "$COMPOSE_DIR"

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

if [ "$before" = "$after" ]; then
  echo "Already running the published images, nothing to deploy."
  exit 0
fi

while read -r service image; do
  previous=$(printf '%s\n' "$before" | awk -v s="$service" '$1 == s { print $2 }')
  if [ "$previous" != "$image" ]; then
    echo "Deployed ${service}: ${previous} -> ${image}"
  fi
done <<< "$after"

# Both services were just replaced, so both are checked, and the backend has to say so in the body:
# matching only a status code would accept any process that answers on the port.
healthy() {
  curl -fsS --max-time 5 "$BACKEND_HEALTH_URL" | grep -q '"status":"ok"' \
    && curl -fsS --max-time 5 -o /dev/null "$FRONTEND_URL"
}

for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if healthy; then
    echo "Health check passed after ${attempt} attempt(s)."
    docker image prune --force --filter 'until=168h' > /dev/null
    exit 0
  fi
  sleep "$HEALTH_INTERVAL"
done

echo "Health check still failing after $((HEALTH_ATTEMPTS * HEALTH_INTERVAL))s:" >&2
echo "  backend  ${BACKEND_HEALTH_URL}" >&2
echo "  frontend ${FRONTEND_URL}" >&2
exit 1
