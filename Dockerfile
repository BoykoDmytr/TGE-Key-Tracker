FROM node:20-alpine
WORKDIR /usr/src/app

# беремо package.json саме з fly_ws_tracker
COPY fly_ws_tracker/package.json ./package.json
# якщо маєш lock файл — краще теж копіювати
COPY fly_ws_tracker/package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# копіюємо код воркера
COPY fly_ws_tracker/src ./src

CMD ["npm", "start"]
