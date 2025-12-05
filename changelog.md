# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2025-12-05

### Changed
- **SMTP architecture refactored** - Replaced Mailpit with Postfix for consistent email delivery
  - **Production**: Backend → Postfix → Internet (direct delivery to destination mail servers)
  - **Development**: Backend → Postfix → Mailpit (emails captured for inspection at http://localhost:8025)
  - Postfix provides proper MTA functionality with DKIM signing and TLS support
  - Added `POSTFIX_HOSTNAME` environment variable for HELO/EHLO configuration
  - Removed Mailpit relay configuration from production (no longer needed)

### Added
- **Forward & Forget Feature** - Privacy-focused email forwarding
  - One-click forwarding of emails to your personal inbox
  - OTP validation per temporary mailbox (no accounts required)
  - Rate limiting: 10 forwards per hour per mailbox (configurable)
  - SRS (Sender Rewriting Scheme) for proper SPF alignment
  - DKIM signing support for improved deliverability
  
  **Backend Services:**
  - `smtpService.js` - Outgoing email delivery with DKIM signing
  - `srsService.js` - Sender Rewriting Scheme implementation
  - `otpService.js` - OTP generation/validation using `otp-generator`
  - `rateLimiter.js` - Redis-based rate limiting
  - `forwardingService.js` - Main orchestration service
  - `forwardingController.js` - API endpoints
  
  **Frontend Components:**
  - `ForwardButton.js` - One-click forward with state feedback
  - `OTPModal.js` - Destination email verification flow
  - Updated `EmailModal.js` and `MessageList.js` for integration
  - **Forward button now visible on each message item in the list** (not just in modal)
  
  **API Endpoints:**
  - `POST /api/forwarding/request-otp` - Request verification code
  - `POST /api/forwarding/verify-otp` - Verify and activate forwarding
  - `POST /api/forwarding/forward/:email/:messageId` - Forward message
  - `GET /api/forwarding/status/:email` - Get forwarding status
  - `DELETE /api/forwarding/:email` - Clear forwarding config
  
  **New Environment Variables:**
  - `SMTP_HOST`, `SMTP_OUTGOING_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`
  - `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
  - `DKIM_DOMAIN`, `DKIM_SELECTOR`, `DKIM_PRIVATE_KEY`
  - `SRS_DOMAIN`, `SRS_SECRET`
  - `FORWARDING_RATE_LIMIT`, `OTP_EXPIRATION_MINUTES`, `OTP_LENGTH`
  
  **Privacy Design:**
  - No persistent user accounts
  - OTP validation scoped to temporary mailbox
  - Forwarding state expires with mailbox
  - All data automatically cleaned up

---

## [2.0.4] - 2025-12-05

### Removed
- **Deleted JSON config files** (2025-12-05)
  - Removed `/config` folder (default.json, development.json, production.json) - was unused
  - Removed `/src/config` folder (default.json, development.json, production.json)
  - All configuration now comes exclusively from runtime config (`window.__RUNTIME_CONFIG__`) injected by `env-config.sh` or `REACT_APP_*` environment variables
  - Simplified `configLoader.js` - no JSON imports, no fallbacks
  - Fixed incorrect production API URL (`api.tempmail-service.com`) that was never used

---

## [2.0.3] - 2025-12-05

### Changed
- **Unified time settings to use seconds across frontend and backend** (2025-12-05)
  - Renamed `CONFIG_EMAIL_EXPIRATIONTIME` and `CONFIG_EMAIL_EXTENSIONTIME` to `EMAIL_EXPIRATION_SECONDS` and `EMAIL_EXTENSION_SECONDS`
  - Removed duplicate backend env vars `EMAIL_EXPIRATION` (minutes) and `EMAIL_EXTENSION_TIME` (minutes)
  - Backend now uses seconds directly instead of minutes
  - Updated `backend/config/config.js` to use `emailExpirationSeconds` and `emailExtensionSeconds`
  - Updated `backend/services/redisService.js` to accept seconds parameter
  - Fixed bug: config values now properly passed to redisService functions

### Fixed
- **Backend was ignoring configured expiration times** (2025-12-05)
  - `emailController.js` now passes config values to `registerMailbox()` and `refreshMailbox()`
  - Previously used hardcoded 30-minute defaults regardless of configuration

---

## [2.0.2] - 2025-12-05

### Changed
- **Refactored env-config.sh for maintainability** (2025-12-05)
  - Separated validation, JSON generation, and file patching into distinct functions
  - Added numeric validation for EMAIL_EXPIRATION_SECONDS, EMAIL_EXTENSION_SECONDS, CONFIG_API_TIMEOUT
  - Replaced 12 repetitive AdSense slot conditionals with declarative mapping array
  - Added strict mode (`set -euo pipefail`) for fail-fast behavior
  - Used heredoc for cleaner multi-line JSON template generation
  - Fixed docker-entrypoint.sh to use correct script path directly
  - Removed unnecessary sed patch command from Dockerfile

- **Centralized configuration in .env file** (2025-12-05)
  - Created `.env.example` with all configurable variables and documentation
  - Updated `docker-compose.yml` and `docker-compose-dev.yml` to use .env variables
  - All hardcoded values now have defaults via `${VAR:-default}` syntax
  - Single source of truth for all environment configuration

### Removed
- **Deleted unnecessary shell scripts** (2025-12-05)
  - `env.sh` - legacy script superseded by env-config.sh
  - `extract-styled-components.sh` - one-time dev utility, already used
  - `fix-imports.sh` - one-time migration script, no longer needed
  - `run-docker-compose.sh` - unnecessary wrapper, use `docker compose up -d` directly

---

## [2.0.1] - 2025-12-04

### Added
- **PayPal donate button** (2025-12-04)
  - Added DonateButton component with PayPal SDK integration
  - Button appears below "Why Use Hide Mail?" section in sidebar
  - Button also appears in footer with compact styling
  - Supports dark mode with appropriate color scheme
  - SDK loads asynchronously to avoid blocking page load

- **Click-to-copy functionality for email display** (2025-12-04)
  - Email address is now clickable/tappable to copy to clipboard
  - Works on desktop (click) and mobile/tablet (tap)
  - Visual feedback: "Tap to copy" hint below email, checkmark and green background on success
  - Added fallback clipboard methods for older browsers and mobile Safari
  - Keyboard accessible: press Enter to copy when focused
  - Prompt fallback for devices where clipboard API is unavailable

- **PWA manifest for mobile installability** (2025-12-04)
  - Created `manifest.json` with app metadata and icons
  - Added iOS-specific meta tags for "Add to Home Screen" support
  - Generated icon files: logo192.png, logo512.png, apple-touch-icon.png, favicon.ico
  - Users can now install Hide Mail as a standalone app on iPhone and Android

### Changed
- **Consolidated CI/CD workflows into single pipeline** (2025-12-04)
  - Merged 4 separate workflows (ci.yml, test.yml, build-and-test.yml, build-push-container.yml)
  - New unified workflow: test → build → push containers
  - Push to ghcr.io only happens on main branch (PRs only build)
  - Added GitHub Actions cache for Docker builds (cache-from/cache-to: gha)
  - Added npm cache for faster CI runs

- **Improved backend Dockerfile with multistage build** (2025-12-04)
  - Separated dependency installation into dedicated stage
  - Removes test files, mocks, and coverage from production image
  - Uses npm ci for reproducible builds
  - Results in smaller, cleaner production images

### Security
- **Added explicit permissions to CI workflow** (2025-12-04)
  - Set root-level `permissions: contents: read` (principle of least privilege)
  - Only `build-and-push` job gets elevated `packages: write` permission
  - Prevents workflows from having unnecessary write access to repository

- **Fixed js-yaml prototype pollution vulnerability** (2025-12-04)
  - Updated `js-yaml` from 3.14.1 to 3.14.2 in backend dependencies
  - Fixes CVE allowing attackers to modify prototype via `__proto__` in parsed yaml documents
  - All users parsing untrusted yaml documents were potentially impacted

---

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

### Added
- **Copy-to-clipboard improvements for email display** (2025-12-04)
  - Added clipboard icon button in top right corner of email address box
  - Email address now clickable to copy (click anywhere on the address)
  - Text selection with mouse still works (copy only triggers on simple clicks)
  - Visual feedback: icon changes to checkmark and background highlights on copy
  - Animated toast popup notification appears above email on copy (fades out after 2.5s)

### Fixed
- **Fixed race condition in email generation on initial page load** (2025-12-04)
  - EmailService.generateEmail() now calls initialize() to ensure domains are loaded
  - Previously, frontend could attempt to register mailbox with `@undefined` domain
  - Root cause: EmailGenerator component called generateEmail before domains API response

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
- **Fixed HTML sanitization bypass vulnerability in MessageView** (2025-12-04)
  - Replaced vulnerable regex-based sanitization with DOMPurify library
  - Previous regex approach could be bypassed with nested injection (e.g., `<scr<script>ipt>`)
  - DOMPurify properly parses DOM and handles all XSS edge cases
  - Added tests for XSS protection and nested script injection attempts
  - Fixes GitHub CodeQL alert: Incomplete multi-character sanitization (CWE-1333)

- **Fixed critical vulnerabilities in node-forge** (2025-12-04)
  - Updated `node-forge` from 1.3.1 to 1.3.3
  - Fixed ASN.1 Unbounded Recursion vulnerability (High severity)
  - Fixed ASN.1 Validator Desynchronization vulnerability (High severity)
  - Fixed ASN.1 OID Integer Truncation vulnerability (Moderate severity)
  - All three vulnerabilities require node-forge >= 1.3.2, now resolved

- **Fixed email parsing vulnerability in nodemailer** (2025-12-04)
  - Updated `nodemailer` from ^6.9.16 to ^7.0.7
  - Fixed email address parsing vulnerability with quoted local-parts containing @
  - The parser incorrectly handled addresses like `"user@domain.com x"@internal.domain`
  - This could lead to misrouting of email recipients to unintended domains

- **Moved AdSense slot IDs to environment variables** (2025-12-04)
  - Removed hardcoded AdSense slot IDs from source files (App.js, Blog.js, BlogPost.js)
  - Created `src/utils/adsenseSlots.js` utility for configuration-based slot management
  - Updated `env-config.sh` to inject slot IDs into runtime configuration
  - Added support for 12 AdSense slot IDs via environment variables
  - Prevents account-specific configuration from being committed to version control
  - See ADSENSE-SLOTS-CONFIG.md for configuration details

