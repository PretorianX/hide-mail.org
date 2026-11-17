# Hide Mail Send portal

Customer UI for outbound Send (`outbound` licence). Production URL:

**https://hide-mail.org/admin/portal/**

## Path prefix

Vite builds with `base: '/admin/portal/'`. React Router uses `basename="/admin/portal"`.
The portal nginx image serves assets under `/admin/portal/`. The main **frontend** container
proxies `location /admin/portal/` to the `portal` service (compose-only; no `send.hide-mail.org`
host vhost required).

API calls stay same-origin on `https://hide-mail.org/api/outbound/…` (absolute paths from the
browser).

## Local

```bash
npm ci
npm run dev    # http://127.0.0.1:3003/admin/portal/ (proxies /api → :3002)
npm test
npm run build
```
