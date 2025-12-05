# Hide Mail

A temporary email service that provides disposable email addresses for privacy and spam protection.

## Features

- Generate temporary email addresses instantly
- Receive and view emails in real-time
- Select from multiple domains
- Auto-refresh mailbox
- Copy email address to clipboard
- Mobile-friendly responsive design
- Dark/Light theme support

## Quick Start

### Using Pre-built Images (Recommended)

1. Clone the repository and create your environment file:
   ```bash
   git clone https://github.com/pretorianx/hide-mail.org.git
   cd hide-mail.org
   cp .env.example .env
   ```

2. Edit `.env` with your configuration:
   ```
   VALID_DOMAINS=example.com,mail.example.com
   ```

3. Start the application:
   ```bash
   docker compose up
   ```

4. Access the application:
   - **Frontend**: http://localhost:3001
   - **Backend API**: http://localhost:3002/api
   - **Redis Commander**: http://localhost:8081

### Container Images

Pre-built images are available from GitHub Container Registry:

```bash
docker pull ghcr.io/pretorianx/hide-mail.org/frontend:latest
docker pull ghcr.io/pretorianx/hide-mail.org/backend:latest
```

## Development

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Local Development with Hot-Reload

```bash
docker-compose -f docker-compose-dev.yml up --build
```

This enables hot-reloading for both frontend (`src/`, `public/`) and backend (`backend/`) changes.

## Configuration

### Environment Variables

Key configuration options in `.env`:

| Variable | Description |
|----------|-------------|
| `VALID_DOMAINS` | Comma-separated list of email domains |
| `REACT_APP_ADSENSE_CLIENT` | Google AdSense publisher ID (optional) |

For AdSense slot configuration, see [ADSENSE-SLOTS-CONFIG.md](./ADSENSE-SLOTS-CONFIG.md).

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│    Redis    │
│   (React)   │     │  (Node.js)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ SMTP Server │
                    │ (Haraka)    │
                    └─────────────┘
```

## License

[MIT License](LICENSE)
