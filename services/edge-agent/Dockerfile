FROM node:20-alpine AS base
WORKDIR /app

# Instalar GStreamer, plugins y dependencias necesarias (incluye sharp/vips)
RUN apk add --no-cache \
    gstreamer \
    gstreamer-tools \
    gst-plugins-base \
    gst-plugins-good \
    gst-plugins-bad \
    gst-plugins-ugly \
    gst-libav \
    gst-rtsp-server \
    vips-dev \
    build-base \
    python3

COPY package*.json ./
RUN npm install
COPY . .
# Copiar configuración TOML
COPY config.toml ./
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
