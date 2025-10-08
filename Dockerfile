# ---------- STAGE 1: Build ----------
FROM node:22-slim AS builder

WORKDIR /app

# Копируем только package.json и lock-файл — для кэширования зависимостей
COPY package*.json ./

# Устанавливаем все зависимости (включая dev для сборки)
RUN npm install

# Копируем исходный код
COPY . .

# Собираем проект NestJS
RUN npm run build


# ---------- STAGE 2: Production ----------
FROM node:22-slim AS production

WORKDIR /app

# Устанавливаем только необходимые пакеты для runtime
RUN npm install -g pm2

# Копируем package.json и lock-файл для установки prod-зависимостей
COPY package*.json ./
RUN npm install --omit=dev

# Копируем собранные артефакты из билдера
COPY --from=builder /app/dist ./dist

# (опционально) — копируем env-файл, если он есть
COPY .production.env .production.env

# Указываем переменную окружения
ENV NODE_ENV=production

# Открываем порт
EXPOSE 7002

# Запуск через pm2-runtime
CMD ["pm2-runtime", "dist/main.js"]
