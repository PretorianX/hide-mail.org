# Changelog

All notable changes to this project will be documented in this file.

### Changed
- **Updated Content Security Policy for AdSense and Google Fonts** (2025-12-04)
  - Added Google Fonts domains (fonts.googleapis.com, fonts.gstatic.com) to CSP
  - Added AdSense domains to script-src, connect-src, and frame-src directives
  - Resolves CSP violations preventing AdSense ads and Google Fonts from loading
  - Updated nginx/hide-mail.conf with comprehensive AdSense domain allowlist
- **Renamed EMAIL_DOMAINS to VALID_DOMAINS** (2025-12-04)
  - Standardized environment variable naming across all configuration files
  - Updated docker-compose.yml, docker-compose-dev.yml, run-docker-compose.sh, env-config.sh
  - Added comprehensive unit tests for config module (13 tests)

### Security
- **Fixed critical vulnerabilities in node-forge** (2025-12-04)
  - Updated `node-forge` from 1.3.1 to 1.3.3
  - Fixed ASN.1 Unbounded Recursion vulnerability (High severity)
  - Fixed ASN.1 Validator Desynchronization vulnerability (High severity)
  - Fixed ASN.1 OID Integer Truncation vulnerability (Moderate severity)
  - All three vulnerabilities require node-forge >= 1.3.2, now resolved

- **Moved AdSense slot IDs to environment variables** (2025-12-04)
  - Removed hardcoded AdSense slot IDs from source files (App.js, Blog.js, BlogPost.js)
  - Created `src/utils/adsenseSlots.js` utility for configuration-based slot management
  - Updated `env-config.sh` to inject slot IDs into runtime configuration
  - Added support for 12 AdSense slot IDs via environment variables
  - Prevents account-specific configuration from being committed to version control
  - See ADSENSE-SLOTS-CONFIG.md for configuration details

