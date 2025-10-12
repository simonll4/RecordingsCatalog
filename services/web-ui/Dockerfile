FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Copiar configuración TOML
COPY config.toml ./
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
