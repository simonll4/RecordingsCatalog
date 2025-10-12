FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Copiar configuración TOML
COPY config.toml ./
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
