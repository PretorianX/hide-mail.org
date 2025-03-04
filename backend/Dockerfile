FROM node:18-alpine

WORKDIR /app

# Copy package.json first for better caching
COPY package.json ./

# Check if package-lock.json exists and copy it if it does
COPY package-lock.json* ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose ports
EXPOSE 3001
EXPOSE 2525

# Start the application
CMD ["node", "server.js"] 