FROM node:18-alpine

WORKDIR /app

# Copy package.json first for better caching
COPY package.json ./

# Use npm install instead of npm ci since we don't have a package-lock.json
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose ports
EXPOSE 3001
EXPOSE 2525

# Start the application
CMD ["node", "server.js"] 