#!/bin/sh
# Register a cleartext SMTP client for bounce mail-back to the backend inbound listener.
set -eu

MASTER_CF=/etc/postfix/master.cf

if grep -q '^bounce_internal[[:space:]]' "$MASTER_CF" 2>/dev/null; then
  exit 0
fi

cat >> "$MASTER_CF" <<'EOF'
# Hide Mail: local bounce NDR → backend:2525 (TLS off on Docker network)
bounce_internal unix - - n - - smtp
  -o smtp_tls_security_level=none
  -o smtp_tls_wrappermode=no
EOF
