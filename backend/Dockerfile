# Stage 1: Install dependencies
FROM node:24-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for potential build scripts)
RUN npm ci --only=production

# Stage 2: Production image
FROM node:24-alpine AS production

WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Remove unnecessary files from the image
RUN rm -rf tests __mocks__ *.test.js coverage .eslintrc* jest.config.js

# Create logs directory and set permissions
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Add metadata labels following OCI image spec
LABEL org.opencontainers.image.source="https://github.com/${GITHUB_REPOSITORY}"
LABEL org.opencontainers.image.description="Hide Mail - disposable email service backend"
LABEL org.opencontainers.image.licenses="MIT"

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3001
EXPOSE 2525

# Start the application
CMD ["node", "server.js"]
