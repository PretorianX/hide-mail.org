# Hide Mail Send portal — static SPA served by nginx.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json jest.config.cjs ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Vite base is /admin/portal/ — assets must live under that path in the image.
COPY --from=build /app/dist /usr/share/nginx/html/admin/portal
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

