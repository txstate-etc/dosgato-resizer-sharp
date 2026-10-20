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

INSERT INTO requestedresizes (binaryId) VALUES (1), (2), (3), (4), (5), (6);
