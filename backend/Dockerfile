FROM node:24-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies using npm install instead of npm ci
# since package-lock.json might be out of sync
RUN npm install --only=production

# Copy the rest of the application
COPY . .

# Create a non-root user and switch to it
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

# Add metadata labels following OCI image spec
LABEL org.opencontainers.image.source="https://github.com/${GITHUB_REPOSITORY}"
LABEL org.opencontainers.image.description="Hide Mail - disposable email service backend"
LABEL org.opencontainers.image.licenses="MIT"

# Create logs directory and set permissions
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3001
EXPOSE 2525

# Start the application
CMD ["node", "server.js"] 