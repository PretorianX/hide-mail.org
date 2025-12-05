#!/bin/bash
set -euo pipefail

# =============================================================================
# Runtime Environment Configuration Script
# Generates /usr/share/nginx/html/runtime-env.js from environment variables
# =============================================================================

readonly ENV_FILE="/usr/share/nginx/html/runtime-env.js"
readonly JS_DIR="/usr/share/nginx/html/static/js"

# -----------------------------------------------------------------------------
# Validation Functions
# -----------------------------------------------------------------------------

validate_required_vars() {
  local missing_vars=()
  local required_vars=(
    "VALID_DOMAINS"
    "EMAIL_EXPIRATION_SECONDS"
    "EMAIL_EXTENSION_SECONDS"
    "CONFIG_API_URL"
    "CONFIG_API_TIMEOUT"
  )

  for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      missing_vars+=("$var")
    fi
  done

  if [[ ${#missing_vars[@]} -ne 0 ]]; then
    echo "ERROR: Missing required environment variables: ${missing_vars[*]}" >&2
    exit 1
  fi
}

validate_numeric() {
  local var_name="$1"
  local value="${!var_name:-}"
  
  if [[ -n "$value" ]] && ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "ERROR: $var_name must be a positive integer, got: '$value'" >&2
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# JSON Generation Functions
# -----------------------------------------------------------------------------

domains_to_json_array() {
  local domains="$1"
  echo "$domains" | sed 's/,/","/g; s/^/["/; s/$/"]/'
}

generate_adsense_slots_json() {
  local slots=""
  local slot_mappings=(
    "REACT_APP_ADSENSE_SLOT_TOP_BANNER:topBanner"
    "REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD:topPageAd"
    "REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD:bottomPageAd"
    "REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE:sidebarRectangle"
    "REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER:middleBanner"
    "REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER:beforeFooter"
    "REACT_APP_ADSENSE_SLOT_FOOTER:footer"
    "REACT_APP_ADSENSE_SLOT_BLOG_TOP:blogTop"
    "REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM:blogBottom"
    "REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP:blogPostTop"
    "REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE:blogPostMiddle"
    "REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM:blogPostBottom"
  )

  for mapping in "${slot_mappings[@]}"; do
    local env_var="${mapping%%:*}"
    local json_key="${mapping##*:}"
    local value="${!env_var:-}"
    
    if [[ -n "$value" ]]; then
      slots+="      $json_key: '$value',\n"
    fi
  done

  echo -e "$slots"
}

generate_runtime_config() {
  local domains_json
  domains_json=$(domains_to_json_array "$VALID_DOMAINS")

  cat > "$ENV_FILE" << EOF
// Runtime environment variables - generated at container startup
window.__RUNTIME_CONFIG__ = {
  email: {
    domains: $domains_json,
    expirationTime: $EMAIL_EXPIRATION_SECONDS,
    extensionTime: $EMAIL_EXTENSION_SECONDS,
  },
  api: {
    url: '$CONFIG_API_URL',
    timeout: $CONFIG_API_TIMEOUT,
  },
EOF

  # Add AdSense configuration if client ID is set
  if [[ -n "${REACT_APP_ADSENSE_CLIENT:-}" ]]; then
    local slots_json
    slots_json=$(generate_adsense_slots_json)
    
    echo "  adsense: {" >> "$ENV_FILE"
    echo "    client: '$REACT_APP_ADSENSE_CLIENT'," >> "$ENV_FILE"
    
    if [[ -n "$slots_json" ]]; then
      echo "    slots: {" >> "$ENV_FILE"
      echo -e "$slots_json" >> "$ENV_FILE"
      echo "    }," >> "$ENV_FILE"
    fi
    
    echo "  }," >> "$ENV_FILE"
  fi

  echo "};" >> "$ENV_FILE"
}

# -----------------------------------------------------------------------------
# File Patching Functions
# -----------------------------------------------------------------------------

patch_adsense_client_id() {
  local client_id="${REACT_APP_ADSENSE_CLIENT:-}"
  
  if [[ -z "$client_id" ]]; then
    return
  fi

  echo "Updating AdSense configuration..."

  # Update hardcoded client IDs in JS files
  find "$JS_DIR" -type f -name "*.js" -exec \
    sed -i "s|ca-pub-YOURPUBID|$client_id|g" {} \;

  # Update adsense-config.js if it exists
  local adsense_config="/usr/share/nginx/html/adsense-config.js"
  if [[ -f "$adsense_config" ]]; then
    sed -i "s|ca-pub-YOURPUBID|$client_id|g" "$adsense_config"
  fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
  echo "Generating runtime environment configuration..."

  validate_required_vars
  validate_numeric "EMAIL_EXPIRATION_SECONDS"
  validate_numeric "EMAIL_EXTENSION_SECONDS"
  validate_numeric "CONFIG_API_TIMEOUT"

  generate_runtime_config
  patch_adsense_client_id

  echo "Environment variables injected to $ENV_FILE"
}

main "$@"
