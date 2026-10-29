-- Schema for the four tables the resizer touches, copied from the DosGato
-- API's src/createdb.ts (txstate-etc/dosgato) so the unique keys the
-- ON DUPLICATE KEY clauses rely on match production.

CREATE TABLE IF NOT EXISTS `binaries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shasum` CHAR(43) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
  `mime` VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
  `meta` JSON NOT NULL,
  `bytes` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `shasum_UNIQUE` (`shasum`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
DEFAULT COLLATE = utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `resizes` (
  `binaryId` INT UNSIGNED NOT NULL,
  `originalBinaryId` INT UNSIGNED NOT NULL,
  `width` SMALLINT UNSIGNED NOT NULL,
  `height` SMALLINT UNSIGNED NOT NULL,
  `quality` TINYINT UNSIGNED NOT NULL,
  `othersettings` JSON NOT NULL,
  PRIMARY KEY (`binaryId`, `originalBinaryId`),
  INDEX `resize_idx` (`originalBinaryId`, `width`, `height`, `quality`),
  CONSTRAINT `FK_resizes_binaries_id`
    FOREIGN KEY (`binaryId`)
    REFERENCES `binaries` (`id`),
  CONSTRAINT `FK_resizes_binaries_original`
    FOREIGN KEY (`originalBinaryId`)
    REFERENCES `binaries` (`id`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
DEFAULT COLLATE = utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS requestedresizes (
  binaryId INT UNSIGNED NOT NULL,
  started DATETIME,
  completed DATETIME,
  withError TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (binaryId),
  INDEX(started)
)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
DEFAULT COLLATE = utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS migratedresizeinfo (
  originalChecksum CHAR(43) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
  resizedChecksum CHAR(43) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
  mime VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
  size INT UNSIGNED NOT NULL,
  quality INT UNSIGNED NOT NULL,
  lossless TINYINT UNSIGNED NOT NULL,
  width SMALLINT UNSIGNED,
  height SMALLINT UNSIGNED,
  PRIMARY KEY (originalChecksum, width, mime)
)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
DEFAULT COLLATE = utf8mb4_general_ci;

-- Seed data. The shasum, bytes and meta of binary 1 must match
-- test/files/original.png exactly (seed-files.mjs places that file in the
-- file store volume); regenerate the values if the image ever changes.
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (1, '0scB5aexuTMmy0T63kdfx9z0F6k4AMJE1Gn-gJAp2zw', 'image/png', '{"width":200,"height":150}', 81249);

-- An SVG should be skipped by the resizer: requestedresizes gets completed
-- but no resizes are created and the file never needs to exist on disk.
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (2, 'svgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvg0', 'image/svg+xml', '{"width":300,"height":300}', 1234);

-- Migration path (DOSGATO_MIGRATION=true): this original has a pre-seeded
-- migratedresizeinfo row whose resized file exists on disk
-- (test/files/migrated-resize.webp), so the resizer should register that
-- resize directly and never read the original - which is why the original
-- file deliberately does not exist.
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (3, 'migmigmigmigmigmigmigmigmigmigmigmigmigmig0', 'image/png', '{"width":200,"height":150}', 50000);
INSERT INTO migratedresizeinfo (originalChecksum, resizedChecksum, mime, size, quality, lossless, width, height) VALUES
  ('migmigmigmigmigmigmigmigmigmigmigmigmigmig0', 'Dsf8PGCGqCdzVeMbR_jRd7esnfEsIQ1e_wMvd3V8HtY', 'image/webp', 800, 75, 0, 100, 75);

-- Error path: a processable image whose file is missing from the file store.
-- sharp fails to read it, so the resizer should set withError=1 and leave
-- completed NULL (no automatic retry).
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (4, 'mismismismismismismismismismismismismismis0', 'image/png', '{"width":40,"height":30}', 5000);

-- Transparency: shasum/bytes/meta must match test/files/transparent.png.
-- Not opaque, so the non-webp output format should be png instead of jpeg.
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (5, 'sDNqNsYP75GyV90HmCs04cbCWQJ52cH-uewcbNVKLQk', 'image/png', '{"width":160,"height":120}', 69810);

-- Non-image mime: skipped just like the SVG, no file needed.
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (6, 'pdfpdfpdfpdfpdfpdfpdfpdfpdfpdfpdfpdfpdfpdf0', 'application/pdf', '{}', 9999);

-- Animation: shasum/bytes/meta must match test/files/animated.gif and
-- test/files/animated.webp. Both are 4 frames of 200x150 with delays of
-- 100/200/300/400ms; the gif loops forever and the webp loops 3 times. Output
-- should be gif + webp only, with every frame, delay and the loop count kept.
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (7, 'tP5stTTBigL99G1DlfpH3qvZ5zMxaot28-J51-3a3bc', 'image/gif', '{"width":200,"height":150}', 31895),
  (8, '4QVqox_nkD7klagP4anoJ0EBwUmWOidVmkRd0Zby4e8', 'image/webp', '{"width":200,"height":150}', 5642);

-- EXIF orientation: test/files/landscape_1..8.jpg and portrait_1..8.jpg from
-- https://github.com/ianare/exif-samples/tree/master/jpg/orientation, in
-- that order. Each stores its pixels transformed and tags the EXIF
-- orientation (1-8) that undoes it, so every one should display the same
-- upright picture. Like the DosGato API, meta holds the displayed
-- dimensions, i.e. width and height are swapped for orientations 5-8.
INSERT INTO binaries (id, shasum, mime, meta, bytes) VALUES
  (9, 'h-onup8kyxMyUYUKfr0RQnul5L4KOoU0pYsABBstsG0', 'image/jpeg', '{"width":600,"height":450}', 139435),
  (10, 'R6pywCvSSxfbWM2OJaV92X9Uq8lGH8H7i_LYiJ2ElKU', 'image/jpeg', '{"width":600,"height":450}', 137359),
  (11, 'Uz8ubTWmLpvBRNuzkhqbIQXPJJjqr7EIEvGX5hCL11g', 'image/jpeg', '{"width":600,"height":450}', 140965),
  (12, 'VSVo9pZfdslPztXNMoZ3X8x3RvvHlvenq458jVM7Zmw', 'image/jpeg', '{"width":600,"height":450}', 140588),
  (13, 'WS-QNwb-SyFaCK29Dti2LSiq1OZTLuE3d_SqEnh_VKc', 'image/jpeg', '{"width":600,"height":450}', 137611),
  (14, 'oFCCxXgZIyEGoGEvVyaO-rAR96Kkd0g7h4orRQnNjlk', 'image/jpeg', '{"width":600,"height":450}', 137628),
  (15, '5Sc9TqX93K8n_vx-pBYsKzx3rQVuLY1lpdYXh7WxXbQ', 'image/jpeg', '{"width":600,"height":450}', 140645),
  (16, 'W1yZecv2B36XiUSIviDISbXrAI_mhcDLdQYMSraBLOA', 'image/jpeg', '{"width":600,"height":450}', 141286),
  (17, 'MbBqaH0JSquqthG724Oze-4ETXQRCH4kEgFpqKfVpRE', 'image/jpeg', '{"width":450,"height":600}', 129059),
  (18, '8LBsdWlPbZfhcSHa4Gl4Mt6g2vDNgeTQ6BB8vop-KZ8', 'image/jpeg', '{"width":450,"height":600}', 136072),
  (19, 'yp-5oVkyDmIJ1TpXmwS-MjCVeXuL_Iq1EQ7Iw47PmBg', 'image/jpeg', '{"width":450,"height":600}', 135813),
  (20, 'UPwWrRF0_G7d0ALs2LqjEBMsVv2PcyCWiJ4QXXGPrBo', 'image/jpeg', '{"width":450,"height":600}', 131520),
  (21, '3736-KcuT96GhsCN9s_jMoZGNa_9Cp-24GyxBglLMC4', 'image/jpeg', '{"width":450,"height":600}', 133715),
  (22, 'Mjzg1xQL52y-ZRHiaHZiQd_nTt3zS3Pyf0Y35VLI2CQ', 'image/jpeg', '{"width":450,"height":600}', 136257),
  (23, 'eSeUQI3Fciets0GnWldm42kEp-wOZA1syi2LFP4lwUE', 'image/jpeg', '{"width":450,"height":600}', 135366),
  (24, 'JpFmbGS2jVY_UCJsLfkhye3ugnq_QC6SK-S-LpkvsGE', 'image/jpeg', '{"width":450,"height":600}', 132543);

INSERT INTO requestedresizes (binaryId) VALUES (1), (2), (3), (4), (5), (6), (7), (8),
  (9), (10), (11), (12), (13), (14), (15), (16), (17), (18), (19), (20), (21), (22), (23), (24);
