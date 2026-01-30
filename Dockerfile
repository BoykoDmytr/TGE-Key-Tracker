FROM node:20-alpine
WORKDIR /app

# 1) Ставимо залежності
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) Копіюємо твій код воркера (БЕЗ слеша на початку!)
COPY src ./src

# 3) Запуск
CMD ["node", "src/index.js"]
