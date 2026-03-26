# Stage 1: сборка зависимостей
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=optional
COPY . .

# Stage 2: финальный минимальный образ
FROM node:18-slim
RUN apt-get update && apt-get install -y --no-install-recommends libvips curl ca-certificates \
    && curl -fsSL https://download.docker.com/linux/static/stable/$(uname -m)/docker-27.5.1.tgz | tar xz --strip-components=1 -C /usr/local/bin docker/docker \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .
CMD ["node", "server.js"]
