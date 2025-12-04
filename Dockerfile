# Use multi-stage builds to avoid storing credentials in the final image
# Stage 1: Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy only package files first to leverage Docker cache
COPY package*.json ./

# Install all dependencies (including dev dependencies) for the build process
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM nginx:alpine AS production

# Install bash for env-config.sh script
RUN apk add --no-cache bash

# Copy built files from build stage to nginx serve directory
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add script to replace environment variables at runtime
COPY ./env-config.sh /
RUN chmod +x /env-config.sh

# Create a wrapper script to run both env-config and nginx
COPY ./docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Update the docker-entrypoint.sh to use the env-config.sh from the root directory
RUN sed -i 's|/usr/share/nginx/html/env-config.sh|/env-config.sh|g' /docker-entrypoint.sh

# Add metadata labels following OCI image spec
LABEL org.opencontainers.image.source="https://github.com/${GITHUB_REPOSITORY}"
LABEL org.opencontainers.image.description="Hide Mail - disposable email service frontend"
LABEL org.opencontainers.image.licenses="MIT"

# Expose port 80
EXPOSE 80

# Start nginx with our wrapper script
CMD ["/docker-entrypoint.sh"] 