# ============================================
# Stage 1: Build
# ============================================
FROM node:22-slim AS builder
WORKDIR /app
# Для native-зависимостей (sharp, bcryptjs и т.д.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# ============================================
# Stage 2: Production
# ============================================
FROM node:22-slim AS production
WORKDIR /app
# Для sharp в рантайме
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev && \
    rm -rf /var/lib/apt/lists/*
# Production-зависимости
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Копируем билд и статику
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/static ./static 2>/dev/null || true
COPY --from=builder /app/public ./public 2>/dev/null || true
# Переменные окружения передаются через docker-compose (env_file),
# НЕ копируем .production.env в образ!
ENV NODE_ENV=production
# Non-root пользователь (node уже есть в образе node:22-slim)
USER node
# API:5005, UDP:3032 (Asterisk), WS:3033 (Socket.IO)
EXPOSE 5005 3032/udp 3033
# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5005/api', (r) => { process.exit(r.statusCode < 500 ? 0 : 1) }).on('error', () => process.exit(1))"
CMD ["node", "dist/main.js"]