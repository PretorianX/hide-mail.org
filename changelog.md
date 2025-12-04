# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2025-12-04

### Changed
- **Upgraded tech stack to latest versions**
  - Node.js: 20 → 24 LTS (latest Long-Term Support)
  - React: 18.2.0 → 18.3.1
  - react-router-dom: 6.20.1 → 6.28.0
  - axios: 1.6.2 → 1.7.9
  - styled-components: 6.1.1 → 6.1.13
  - @faker-js/faker: 8.3.1 → 9.3.0
  - @testing-library/jest-dom: 6.1.5 → 6.6.3
  - @testing-library/react: 14.1.2 → 16.1.0
  - web-vitals: 3.5.0 → 4.2.4
  - dompurify: 3.2.4 → 3.2.2
  - express: 4.18.2 → 4.21.2
  - dotenv: 16.3.1 → 16.4.7
  - ioredis: 5.3.2 → 5.4.2
  - mailparser: 3.6.5 → 3.7.2
  - smtp-server: 3.13.0 → 3.13.6
  - uuid: 9.0.1 → 11.0.3
  - winston: 3.11.0 → 3.17.0
  - nodemailer: 6.9.7 → 6.9.16
  - nodemon: 3.0.1 → 3.1.7
  - supertest: 6.3.3 → 7.0.0
  - Redis: alpine → 8-alpine (latest stable)
  - All @babel/plugin-transform-* packages updated to 7.25.9
  - Added `engines` field to package.json files requiring Node.js >=24.0.0

---

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

