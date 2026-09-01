FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma/
RUN apk add --no-cache openssl libc6-compat && npx prisma generate

COPY . .

RUN mkdir -p uploads

EXPOSE 5000

CMD ["node", "server.js"]
