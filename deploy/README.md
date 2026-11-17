# Production deploy

The prod compose file refers to the `:latest` tags in GHCR, and CI publishes those tags on every
push to `main`. A timer on the host pulls them, so a merge reaches production on its own within
about five minutes and nothing has to be triggered by hand.

CI holds no credentials for the host and never connects to it. The host pulls; the registry is
public, so it needs no registry login either.

## Install

Run once as root on the host, from a checkout of this repository:

```bash
install -m 755 deploy/hidemail-autodeploy.sh /usr/local/bin/hidemail-autodeploy
install -m 644 deploy/hidemail-autodeploy.service /etc/systemd/system/
install -m 644 deploy/hidemail-autodeploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hidemail-autodeploy.timer
```

Update the script the same way after changing it; the unit reads it fresh on every run.

## Operate

```bash
systemctl list-timers hidemail-autodeploy.timer   # when it next runs
systemctl start hidemail-autodeploy               # deploy now, without waiting
journalctl -u hidemail-autodeploy -n 50           # what the last runs did
```

A run that changed nothing says so; a run that deployed prints the old and new image ID per service.
Either way the run ends with the health check, so the unit's state always reflects whether
production is answering, not merely whether the last pull found something new.

## When a deploy fails

The script checks both containers on every run and fails the unit if either does not answer, which
leaves `systemctl status hidemail-autodeploy` reporting failed and the reason in the journal. The
check runs even when nothing was deployed, so a broken production keeps the unit failed instead of
being reported healthy by the next run that finds no new image. The backend check reads the response body, not just the status code, because host port 3001
belongs to the frontend and answers `/health` with the SPA's `index.html` and a 200. It does not
roll back. Restoring a previous image is a decision about which version is
correct, and a script cannot make it: pin the working tag in `docker-compose.yml` and deploy that.

## Settings

The script reads these from the environment, so a `systemctl edit hidemail-autodeploy` override can
change them without touching the script:

| Variable | Default | Meaning |
| --- | --- | --- |
| `COMPOSE_DIR` | `/home/www-data/hide-mail.org` | Directory holding `docker-compose.yml` and `.env` |
| `BACKEND_HEALTH_URL` | `http://127.0.0.1:3002/health` | Must return `"status":"ok"` after a deploy |
| `FRONTEND_URL` | `http://127.0.0.1:3001/` | Must answer after a deploy |
| `PORTAL_URL` | `http://127.0.0.1:3003/` | Send portal must answer after a deploy |
| `HEALTH_ATTEMPTS` | `30` | Health attempts before the unit fails |
| `HEALTH_INTERVAL` | `2` | Seconds between attempts |

## Send portal host notes

- Publish DNS A/AAAA for `send.hide-mail.org` and obtain a Let's Encrypt cert (see nginx `send.hide-mail.org` server block).
- Host nginx proxies `/` → portal `:3003` and `/api/outbound/` → backend `:3002`. The main `hide-mail.org` vhost returns 404 for `/api/outbound/`.
- Remaining go-live ops (sending IP/PTR, `rp.hide-mail.org` MX/SPF, Prometheus rules, Mongo/ZoneMTA capacity) are outside this script — see design spec §7.
