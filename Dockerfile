FROM node:26-trixie-slim AS build

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
  libexpat1-dev \
  libfftw3-dev \
  libgirepository1.0-dev \
  libheif-dev \
  libhwy-dev \
  libimagequant-dev \
  libjpeg62-turbo-dev \
  libjxl-dev \
  liblcms2-dev \
  libmatio-dev \
  libopenjp2-7-dev \
  liborc-0.4-dev \
  libpango1.0-dev \
  libpoppler-glib-dev \
  libpng-dev \
  librsvg2-dev \
  libspng-dev \
  libtiff-dev \
  libwebp-dev

ARG VIPS_VERSION=8.18.7
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
# skip sharp's prebuilt binaries and compile it against the libvips above
# the prebuilt libvips cannot decode HEVC (iPhone HEIC) for licensing reasons
RUN npm ci --omit=optional
RUN npm explore sharp -- npm run build
COPY tsconfig.json ./
COPY src src
RUN npm run build
RUN npm prune --omit=dev --omit=optional

FROM node:26-trixie-slim
RUN apt-get update && apt-get install -y \
  libglib2.0-0t64 \
  libarchive13t64 \
  libcgif0 \
  libexif12 \
  libexpat1 \
  libfftw3-double3 \
  libgirepository-1.0-1 \
  libheif1 \
  libhwy1t64 \
  libimagequant0 \
  libjpeg62-turbo \
  libjxl0.11 \
  liblcms2-2 \
  libmatio13 \
  libopenjp2-7 \
  liborc-0.4-0t64 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libpangoft2-1.0-0 \
  libpoppler-glib8t64 \
  libpng16-16t64 \
  librsvg2-2 \
  libspng0 \
  libtiff6 \
  libwebp7 \
  libwebpdemux2 \
  libwebpmux3 \
  && rm -rf /var/lib/apt/lists/*

ENV LD_LIBRARY_PATH=/usr/local/lib
COPY --from=build /usr/local/lib /usr/local/lib
COPY --from=build /usr/local/bin/vips* /usr/local/bin
WORKDIR /usr/app
COPY package.json ./
COPY package-lock.json ./
COPY --from=build /usr/app/node_modules node_modules
COPY --from=build /usr/app/dist .

CMD [ "node", "--no-warnings", "--enable-source-maps", "./index.js" ]
