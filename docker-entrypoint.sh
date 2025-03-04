#!/bin/sh
set -e

# Run the environment configuration script
/usr/share/nginx/html/env-config.sh

# Start nginx
nginx -g "daemon off;" 