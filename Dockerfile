FROM node:22-slim

WORKDIR /app/aiPBX_backend

# Установка зависимостей
COPY package*.json ./
RUN npm install -g pm2 && npm install

# Копируем код и билдим
COPY . .
RUN npm run build

# Удаляем dev-зависимости
RUN npm prune --production

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
