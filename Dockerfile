FROM node:20-alpine
WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .
CMD ["npm", "start"]
