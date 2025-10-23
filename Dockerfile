FROM node:22

RUN apt-get update && apt-get install -y bash

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Cổng mà backend lắng nghe
EXPOSE 5000

CMD ["npm", "start"]