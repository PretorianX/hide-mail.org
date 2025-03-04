# Use Node.js as the base image
FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Copy package.json first
COPY package.json ./

# Install dependencies (use npm install since package-lock.json might not exist)
RUN npm install

# Copy all files
COPY . .

# Validate config files exist
RUN if [ ! -f ./config/default.json ] || [ ! -f ./config/production.json ]; then \
      echo "ERROR: Missing required config files" && exit 1; \
    fi

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from build stage to nginx serve directory
COPY --from=build /app/build /usr/share/nginx/html

# Copy config files to make them available at runtime
COPY --from=build /app/config /usr/share/nginx/html/config

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add script to replace environment variables at runtime
RUN apk add --no-cache bash
COPY ./env-config.sh /usr/share/nginx/html/
RUN chmod +x /usr/share/nginx/html/env-config.sh

# Create a wrapper script to run both env-config and nginx
COPY ./docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Expose port 80
EXPOSE 80

# Start nginx with our wrapper script
CMD ["/docker-entrypoint.sh"] 