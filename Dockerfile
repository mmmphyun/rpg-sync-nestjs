# 1. Build Stage
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 2. Production Runtime Stage
FROM node:24-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 빌드 산출물 및 정적 템플릿/에셋 복사
COPY --from=builder /usr/src/app/dist ./dist
COPY views ./views
COPY public ./public

EXPOSE 3000

CMD ["node", "dist/main.js"]
