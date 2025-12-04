# Hide Mail

A temporary email service that provides disposable email addresses for privacy and spam protection, with container images stored in GitHub Container Registry (GHCR).

## Features

- Generate temporary email addresses
- Receive and view emails in real-time
- Select from multiple domains
- Auto-refresh mailbox
- Copy email address to clipboard
- Mobile-friendly responsive design

## Container Images

This project uses GitHub Container Registry (GHCR) to store and distribute container images. The images are automatically built and pushed to GHCR using GitHub Actions.

### Available Images

- Frontend: `ghcr.io/pretorianx/hide-mail.org/frontend:latest`
- Backend: `ghcr.io/pretorianx/hide-mail.org/backend:latest`

Both images are built for the `linux/amd64` platform.

### Pulling Images

To pull the images:

```bash
# Pull the frontend image
docker pull ghcr.io/pretorianx/hide-mail.org/frontend:latest --platform linux/amd64

# Pull the backend image
docker pull ghcr.io/pretorianx/hide-mail.org/backend:latest --platform linux/amd64
```

You can also use version tags:
```bash
docker pull ghcr.io/pretorianx/hide-mail.org/frontend:v1.0.0 --platform linux/amd64
```

### Using Docker Compose with GHCR Images

We've provided a Docker Compose configuration that uses the pre-built images from GitHub Container Registry:

1. Make sure you're authenticated with GitHub Container Registry:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```

2. Run the provided script to start all services:
   ```bash
   ./run-docker-compose.sh
   ```

   This script will:
   - Load environment variables from your `.env` file
   - Pull the latest images from GitHub Container Registry (linux/amd64 platform)
   - Start all services with Docker Compose
   - Verify that services are running correctly

3. Access the application:
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3002/api
   - Redis Commander: http://localhost:8081

4. To stop all services:
   ```bash
   docker-compose down
   ```

### Image Visibility

By default, packages on GHCR are private. To make your images public:

1. Go to your GitHub repository
2. Click on "Packages" in the right sidebar
3. Click on your container image
4. Click on "Package settings"
5. Under "Danger Zone", change the visibility to "Public"

## Development

### Prerequisites

- Docker and Docker Compose
- Git
- Node.js (for local development)

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/hide-mail-org.git
   cd hide-mail-org
   ```

2. Start the development environment:
   ```bash
   docker-compose up -d
   ```

3. Access the application:
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3002
   - Redis Commander: http://localhost:8081

### Development with Local Builds

For local development with builds from source instead of pulling pre-built images:

1. Use the development compose file:
   ```bash
   docker-compose -f docker-compose-dev.yml up --build
   ```

   This will:
   - Build the frontend and backend images from local source code
   - Mount source directories as volumes for hot-reloading
   - Set NODE_ENV to development
   - Enable debug logging

2. Make changes to your code and see them reflected in real-time
   - Frontend changes in the `src` and `public` directories
   - Backend changes in the `backend` directory

3. To stop the development environment:
   ```bash
   docker-compose -f docker-compose-dev.yml down
   ```

### Environment Variables

Create a `.env` file based on the `.env.template`:

```bash
cp .env.template .env
```

Edit the `.env` file to set your configuration:

```
VALID_DOMAINS=example.com,mail.example.com
REACT_APP_ADSENSE_CLIENT=your-adsense-client-id
```

## Dependency Management

This project uses CRACO (Create React App Configuration Override) to customize the webpack configuration without ejecting. This allows us to:

1. Replace deprecated packages with their newer alternatives
2. Update Babel plugins to use the latest versions
3. Customize the build process as needed

### Updated Dependencies

We've updated several dependencies to address deprecation warnings:

- Replaced deprecated Babel plugins with their newer transform equivalents
- Added `@jridgewell/sourcemap-codec` to replace `sourcemap-codec`
- Added `@rollup/plugin-terser` to replace `rollup-plugin-terser`
- Updated testing libraries to the latest versions

To update dependencies in the future, run:

```bash
npm update
```

## CI/CD with GitHub Actions

This project uses GitHub Actions for continuous integration and deployment:

### Workflows

1. **Test** (`.github/workflows/test.yml`)
   - Runs tests for the application

2. **Build and Test** (`.github/workflows/build-and-test.yml`)
   - Builds and tests both frontend and backend

3. **Build and Push Container Images** (`.github/workflows/build-push-container.yml`)
   - Builds and pushes Docker images to GitHub Container Registry
   - Triggered on pushes to main, tags, or manually

## Security Best Practices

This setup follows these security best practices:
- No credentials in the images
- Multi-stage builds to minimize image size
- Running as a non-root user
- Using specific version tags for base images
- Proper metadata labeling

## AdSense Compliance

This project has been updated to comply with Google AdSense policies. The following changes have been made:

### Content Additions

- Added comprehensive informative content about temporary email services
- Included detailed FAQ section answering common questions
- Added "How It Works" section explaining the service
- Included "Best Practices" section with usage guidelines

### Ad Display Improvements

- Implemented `ContentAwareAd` component that only displays ads when sufficient content is available
- Updated `AdContainer` to check for content availability before rendering
- Ensured ads are only displayed on pages with substantial content
- Added responsive styling for all content sections

### Testing

- Added tests for content availability checks
- Ensured all ad components have proper test coverage
- Verified that ads only display when content requirements are met

### AdSense Integration

To configure AdSense for your deployment:

1. Set your AdSense publisher ID in `.env.production`:
   ```
   REACT_APP_ADSENSE_CLIENT=ca-pub-YOURPUBID
   ```

2. Configure ad slots in the `ContentAwareAd` components in `App.js`

3. Test your implementation using the AdSense preview tool before submitting for review

For more information on AdSense policies, refer to the [Google AdSense Program Policies](https://support.google.com/adsense/answer/48182).

## License

[MIT License](LICENSE)
