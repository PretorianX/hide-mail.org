#!/bin/bash

# Define required environment variables
REQUIRED_VARS=(
  "EMAIL_DOMAINS"
  "CONFIG_EMAIL_EXPIRATIONTIME"
  "CONFIG_EMAIL_EXTENSIONTIME"
  "CONFIG_API_URL"
  "CONFIG_API_TIMEOUT"
)

# Check for missing variables
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

# If any variables are missing, exit with error
if [ ${#MISSING_VARS[@]} -ne 0 ]; then
  echo "ERROR: Missing required environment variables: ${MISSING_VARS[*]}"
  exit 1
fi

# Convert comma-separated domains to JSON array
DOMAINS_JSON="[$(echo $EMAIL_DOMAINS | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' )]"

# Define the directory where your JS files are located
JS_DIR="/usr/share/nginx/html/static/js"

# Create a JavaScript file that will hold the runtime environment variables
ENV_FILE="/usr/share/nginx/html/runtime-env.js"

# Create or clear the file
echo "// Runtime environment variables" > $ENV_FILE
echo "window.__RUNTIME_CONFIG__ = {" >> $ENV_FILE

# Add email configuration
echo "  email: {" >> $ENV_FILE
echo "    domains: $DOMAINS_JSON," >> $ENV_FILE
echo "    expirationTime: $CONFIG_EMAIL_EXPIRATIONTIME," >> $ENV_FILE
echo "    extensionTime: $CONFIG_EMAIL_EXTENSIONTIME," >> $ENV_FILE
echo "  }," >> $ENV_FILE

# Add API configuration
echo "  api: {" >> $ENV_FILE
echo "    url: '$CONFIG_API_URL'," >> $ENV_FILE
echo "    timeout: $CONFIG_API_TIMEOUT," >> $ENV_FILE
echo "  }," >> $ENV_FILE

# Add AdSense configuration if available
if [ ! -z "$REACT_APP_ADSENSE_CLIENT" ]; then
  echo "  adsense: {" >> $ENV_FILE
  echo "    client: '$REACT_APP_ADSENSE_CLIENT'," >> $ENV_FILE
  echo "  }," >> $ENV_FILE
fi

# Close the config object
echo "};" >> $ENV_FILE

echo "Environment variables injected to $ENV_FILE" 