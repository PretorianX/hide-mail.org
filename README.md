# Hide Mail

A temporary email service that provides disposable email addresses for privacy and spam protection.

![Build and Test](https://github.com/mail-duck/hide-mail.org/actions/workflows/build-and-test.yml/badge.svg)

## Features

- Generate temporary email addresses
- Receive and view emails in real-time
- Select from multiple domains
- Auto-refresh mailbox
- Copy email address to clipboard
- Mobile-friendly responsive design

## Development

### Prerequisites

- Docker and Docker Compose
- Git

### Local Development

1. Clone the repository:
   ```
   git clone git@github.com:mail-duck/hide-mail.org.git
   cd hide-mail.org
   ```

2. Start the development environment:
   ```
   docker-compose up -d
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

### Testing

Tests are automatically run in GitHub Actions on every push and pull request.

## CI/CD with GitHub Actions

This project uses GitHub Actions for continuous integration and deployment:

### Workflows

1. **Test** (`.github/workflows/test.yml`)
   - Runs on every push to main/master and on pull requests
   - Executes all tests including domain selection tests

2. **Build and Test** (`.github/workflows/build-and-test.yml`)
   - Runs on every push to main/master and on pull requests
   - Builds and tests both frontend and backend
   - Creates Docker images

3. **Deploy to Production** (`.github/workflows/deploy.yml`)
   - Triggered when a new release is published
   - Builds and pushes Docker images to Docker Hub
   - Deploys to production server

### Required Secrets

For the deployment workflow to work, you need to set up the following secrets in your GitHub repository:

- `DOCKER_HUB_USERNAME`: Your Docker Hub username
- `DOCKER_HUB_TOKEN`: Your Docker Hub access token
- `PRODUCTION_HOST`: The hostname or IP of your production server
- `PRODUCTION_USERNAME`: SSH username for the production server
- `PRODUCTION_SSH_KEY`: SSH private key for authentication

## Architecture

The application consists of:

1. **Frontend**: React application
2. **Backend**: Node.js Express API
3. **Redis**: For storing email data and domains

## License

[MIT License](LICENSE)

## AdSense Integration

This project includes Google AdSense integration with environment variable configuration for security.

### Setup

1. Add your AdSense client ID to the `.env` file:
   ```
   REACT_APP_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
   ```

2. The repository includes:
   - `ads.txt` file in the public directory
   - Meta tag verification in the HTML head
   - AdSense script loading with client parameter in production mode only

### Integration Methods

1. **JavaScript Code Integration**:
   - Script tag with client parameter in HTML head
   - Manual ad placement with the AdSense component
   - Auto ads support (enabled automatically by the script tag)

2. **Ads.txt File**:
   - Located in the public directory
   - Follows the required format: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`

3. **Meta Tag Verification**:
   - Added to the HTML head
   - Helps Google verify site ownership

### Usage

#### Manual Ad Placement

```jsx
import AdSense from './components/AdSense';

// In your component
<AdSense 
  slot="1234567890" 
  format="auto" 
  responsive={true} 
  style={{ width: '100%', height: '250px' }} 
/>
```

#### Using the AdContainer Component (Recommended)

The AdContainer component provides proper sizing and styling for ads:

```jsx
import AdContainer from './components/AdContainer';

// In your component
<AdContainer 
  slot="1234567890" 
  width={300} 
  height={250} 
  position="sidebar" 
/>
```

Common ad sizes:
- 300x250 - Medium Rectangle
- 336x280 - Large Rectangle
- 728x90 - Leaderboard
- 300x600 - Half Page
- 320x100 - Large Mobile Banner

#### Auto Ads

```jsx
import AdSense from './components/AdSense';

// In your App.js or layout component
<AdSense autoAd={true} />
```

### Testing

The AdSense and AdContainer components show placeholders in development mode and only load actual ads in production.
