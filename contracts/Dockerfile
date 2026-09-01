FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx hardhat compile

EXPOSE 8545

CMD ["npx", "hardhat", "node"]
