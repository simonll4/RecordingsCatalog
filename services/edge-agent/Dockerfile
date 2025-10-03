FROM node:20-alpine AS base
WORKDIR /app

# Instalar GStreamer y plugins necesarios
RUN apk add --no-cache \
    gstreamer \
    gstreamer-tools \
    gst-plugins-base \
    gst-plugins-good \
    gst-plugins-bad \
    gst-plugins-ugly \
    gst-libav

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
