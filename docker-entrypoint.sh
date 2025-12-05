#!/bin/bash
set -e

# Run the environment configuration script
/env-config.sh

# Start nginx
exec nginx -g "daemon off;"
