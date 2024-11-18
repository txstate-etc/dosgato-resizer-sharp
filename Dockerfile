FROM node:20-bookworm-slim AS build

RUN apt-get update && apt-get install -y \
  build-essential \
  ninja-build \
  meson \
  wget \
  pkg-config

RUN apt-get install -y \
  libglib2.0-dev \
  libarchive-dev \
  libcgif-dev \
  libexif-dev \
  libexpat-dev \
  libfftw3-dev \
  libgirepository1.0-dev \
  libheif-dev \
  libimagequant-dev \
  libjxl-dev \
  liblcms2-dev \
  libmatio-dev \
  libopenjp2-7-dev \
  liborc-dev \
  libpango1.0-dev \
  libpoppler-glib-dev \
  libpng-dev \
  librsvg2-dev \
  libtiff5-dev \
  libwebp-dev

ARG VIPS_VERSION=8.15.3
ARG VIPS_URL=https://github.com/libvips/libvips/releases/download

WORKDIR /usr/local/src

RUN wget ${VIPS_URL}/v${VIPS_VERSION}/vips-${VIPS_VERSION}.tar.xz \
  && tar xf vips-${VIPS_VERSION}.tar.xz \
  && cd vips-${VIPS_VERSION} \
  && meson build --buildtype=release --libdir=lib \
  && cd build \
  && ninja \
  && ninja install

WORKDIR /usr/app
COPY package.json ./
COPY package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src src
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y \
  libglib2.0 \
  libarchive13 \
  libcgif0 \
  libexif12 \
  libexpat1 \
  libfftw3-bin \
  libgirepository-1.0-1 \
  libheif1 \
  libimagequant0 \
  libjxl0.7 \
  liblcms2-2 \
  libmatio11 \
  libopenjp2-7 \
  liborc-0.4-0 \
  libpango1.0-dev \
  libpoppler-glib-dev \
  libpng-dev \
  librsvg2-dev \
  libtiff5-dev \
  libwebp-dev

ENV LD_LIBRARY_PATH=/usr/local/lib
COPY --from=build /usr/local/lib /usr/local/lib
COPY --from=build /usr/local/bin/vips* /usr/local/bin
WORKDIR /usr/app
COPY package.json ./
COPY package-lock.json ./
COPY --from=build /usr/app/node_modules node_modules
COPY --from=build /usr/app/dist .

CMD [ "node", "--no-warnings", "--enable-source-maps", "./index.js" ]
