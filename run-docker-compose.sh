#!/bin/bash

# Script to run Docker Compose with GitHub Container Registry images

# Set environment variables from .env file if it exists
if [ -f .env ]; then
  echo "Loading environment variables from .env file..."
  export $(grep -v '^#' .env | xargs)
else
  echo "Warning: .env file not found. Using default environment variables."
  # Set default environment variables
  export EMAIL_DOMAINS="hide-mail.org,private-mail.org"
  export REACT_APP_ADSENSE_CLIENT="ca-pub-9729692981183751"
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if user is logged in to GitHub Container Registry
if ! docker pull ghcr.io/mail-duck/hide-mail.org/frontend:latest > /dev/null 2>&1; then
  echo "Error: Failed to pull Docker image. You may need to authenticate with GitHub Container Registry."
  echo "Run: echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
  exit 1
fi

# Pull the latest images
echo "Pulling latest Docker images from GitHub Container Registry..."
docker pull ghcr.io/mail-duck/hide-mail.org/frontend:latest
docker pull ghcr.io/mail-duck/hide-mail.org/backend:latest

# Run Docker Compose
echo "Starting services with Docker Compose..."
docker-compose up -d

# Check if services are running
echo "Checking if services are running..."
sleep 5
if docker-compose ps | grep -q "Up"; then
  echo "Services are running successfully!"
  echo "Frontend is available at: http://localhost:3001"
  echo "Backend API is available at: http://localhost:3002/api"
  echo "Redis Commander is available at: http://localhost:8081"
else
  echo "Error: Services failed to start. Check logs with 'docker-compose logs'."
  exit 1
fi 