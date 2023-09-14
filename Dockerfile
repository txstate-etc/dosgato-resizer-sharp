FROM node:20-alpine as build
WORKDIR /usr/app
COPY package.json ./
COPY package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src src
RUN npm run build

FROM node:20-alpine
RUN apk add vips-heif libheif-dev vips-dev --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main
WORKDIR /usr/app
COPY package.json ./
COPY package-lock.json ./
RUN apk add build-base --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community && npm ci --omit=dev --omit=optional && apk del --purge build-base && rm -rf /var/cache/apk/*
COPY --from=build /usr/app/dist .
COPY tsconfig.json ./

CMD [ "node", "--no-warnings", "--enable-source-maps", "./index.js" ]
