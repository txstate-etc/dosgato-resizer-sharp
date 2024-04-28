FROM node:20-slim as build

RUN apt-get update && apt-get install -y \
	build-essential \
	ninja-build \
	meson \
	wget \
	pkg-config

RUN apt-get install -y \
	glib-2.0-dev \
  libarchive-dev \
  libcgif-dev \
	libexpat-dev \
  libfftw3-dev \
  libheif-dev \
  libimagequant-dev \
	librsvg2-dev \
  libjpeg62-turbo-dev \
  libopenjp2-7-dev \
  libjxl-dev \
  libpng-dev \
  libgif-dev \
	libexif-dev \
	liblcms2-dev \
	libpango1.0-dev \
  libpoppler-glib-dev \
  libtiff5-dev \
  libwebp-dev \
	libgirepository1.0-dev \
	liborc-dev

ARG VIPS_VERSION=8.15.2
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

FROM node:20-slim
RUN apt-get update && apt-get install -y \
glib-2.0-dev \
libarchive-dev \
libcgif-dev \
libexpat-dev \
libfftw3-dev \
libheif-dev \
libimagequant-dev \
librsvg2-dev \
libjpeg62-turbo-dev \
libopenjp2-7-dev \
libjxl-dev \
libpng-dev \
libgif-dev \
libexif-dev \
liblcms2-dev \
libpango1.0-dev \
libpoppler-glib-dev \
libtiff5-dev \
libwebp-dev \
libgirepository1.0-dev \
liborc-dev

ENV LD_LIBRARY_PATH /usr/local/lib
COPY --from=build /usr/local/lib /usr/local/lib
COPY --from=build /usr/local/bin/vips* /usr/local/bin
WORKDIR /usr/app
COPY package.json ./
COPY package-lock.json ./
COPY --from=build /usr/app/node_modules node_modules
COPY --from=build /usr/app/dist .

CMD [ "node", "--no-warnings", "--enable-source-maps", "./index.js" ]
