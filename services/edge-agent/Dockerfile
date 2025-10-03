FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
