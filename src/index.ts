import { lookup } from 'mime-types'
import { type Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import type sharp from 'sharp'
import { keyby, roundTo, sleep, someAsync, stringify } from 'txstate-utils'
import { fileHandler } from './filehandler.js'
import { randomInt } from 'node:crypto'

let stopasap = false
process.on('SIGINT', () => { stopasap = true })
process.on('SIGTERM', () => { stopasap = true })

async function registerResize (originalChecksum: string, width: number, height: number, shasum: string, mime: string, quality: number, size: number, lossless: boolean, tdb: Queryable = db) {
  const origBinaryId = await tdb.getval<number>('SELECT id FROM binaries WHERE shasum=?', [originalChecksum])
  const binaryId = await tdb.insert(`
    INSERT INTO binaries (shasum, mime, meta, bytes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
  `, [shasum, mime, stringify({ width, height }), size])
  await tdb.insert(`
    INSERT INTO resizes (binaryId, originalBinaryId, width, height, quality, othersettings) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE binaryId=binaryId
  `, [binaryId, origBinaryId!, width, height, quality, stringify({ lossless })])
  return binaryId
}

async function cleanupBinaries (checksums: string[]) {
  if (!checksums.length) return
  const binds: string[] = []
  const binaries = await db.getall<{ shasum: string }>(`SELECT shasum FROM binaries WHERE shasum IN (${db.in(binds, checksums)})`, binds)
  const hash = keyby(binaries, 'shasum')
  for (const checksum of checksums) {
    if (!hash[checksum]) await fileHandler.remove(checksum)
  }
}

const resizeLimit = process.env.RESIZE_LIMIT ? parseInt(process.env.RESIZE_LIMIT) : 2
async function processResizesLoop () {
  while (true) {
    let found = false
    if (stopasap) process.exit()
    try {
      const row = await db.getrow<{ binaryId: number, shasum: string }>('SELECT rr.binaryId, b.shasum FROM requestedresizes rr INNER JOIN binaries b ON b.id=rr.binaryId WHERE rr.withError=0 AND rr.completed IS NULL AND (rr.started IS NULL OR rr.started < NOW() - INTERVAL 20 MINUTE) ORDER BY rr.binaryId LIMIT 1')
      if (row) {
        found = true
        const claimed = await db.update('UPDATE requestedresizes SET started=NOW() WHERE withError=0 AND binaryId=? AND (started IS NULL OR started < NOW() - INTERVAL 20 MINUTE)', [row.binaryId])
        if (claimed) {
          try {
            await createResizes(row.shasum)
            await db.update('UPDATE requestedresizes SET completed=NOW() WHERE binaryId=?', [row.binaryId])
          } catch (e: any) {
            if (e.errno !== 1213) {
              // if it was a deadlock we'll allow it to retry in 20 minutes, otherwise we'll set withError=1
              // which will prevent further processing without human intervention
              await db.update('UPDATE requestedresizes SET withError=1 WHERE binaryId=?', [row.binaryId])
            }
            throw e
          }
        }
      }
    } catch (e: any) {
      console.error(e)
    }
    if (!found) await sleep(resizeLimit * 4 * 1000)
  }
}

async function beginProcessingResizes () {
  for (let i = 0; i < resizeLimit; i++) {
    processResizesLoop().catch(console.error)
    await sleep(400 + randomInt(400))
  }
}

const exifToRotation: Record<number, number> = {
  1: 0,
  2: 0,
  3: 180,
  4: 0,
  5: 270,
  6: 90,
  7: 270,
  8: 270
}

const exifToFlip: Record<number, boolean> = {
  1: false,
  2: false,
  3: false,
  4: true,
  5: false,
  6: false,
  7: true,
  8: false
}

const exifToFlop: Record<number, boolean> = {
  1: false,
  2: true,
  3: false,
  4: false,
  5: true,
  6: false,
  7: false,
  8: false
}

async function createResizes (shasum: string) {
  console.info('processing', shasum)
  const binary = await db.getrow<{ id: number, shasum: string, mime: string, meta: string, bytes: number }>('SELECT * from binaries WHERE shasum=?', [shasum])
  if (!binary) return
  if (process.env.DOSGATO_MIGRATION === 'true') {
    const migratedResizes = await db.getall<{ originalChecksum: string, resizedChecksum: string, mime: string, size: number, quality: number, lossless: boolean, width: number, height: number }>('SELECT * FROM migratedresizeinfo WHERE originalChecksum = ?', [shasum])
    if (migratedResizes.length && !await someAsync(migratedResizes, async r => !await fileHandler.exists(r.resizedChecksum))) {
      await Promise.all(migratedResizes.map(async r => await registerResize(shasum, r.width, r.height, r.resizedChecksum, r.mime, r.quality, r.size, r.lossless)))
      return
    }
  }

  const meta = (typeof binary.meta === 'string' ? JSON.parse(binary.meta) : binary.meta) as { width: number, height: number }

  // only process images, excluding SVG and PSD (maybe PSD support could be added in future but sharpjs can't read it)
  if (!meta.width || !binary.mime.startsWith('image/') || ['image/svg+xml', 'image/vnd.adobe.photoshop'].includes(binary.mime)) return

  const resizes: { width: number, height: number, shasum: string, mime: string, quality: number, size: number, lossless: boolean }[] = []
  try {
    const info = await fileHandler.sharp(shasum, { limitInputPixels: 50000 * 50000 }).metadata()
    const orientation = info.orientation ?? 1
    const animated = (info.pages ?? 0) > 1 && info.format !== 'heif'
    const img = fileHandler.sharp(shasum, { animated, limitInputPixels: 50000 * 50000 })
    const stats = await img.stats()
    const transparency = !stats.isOpaque

    // setting uselossless to false to disable lossless resizes - they seem to never
    // be more efficient and the lossy quality of line art is still quite good
    let uselossless: boolean | undefined = false
    for (let w = meta.width; w >= 50; w = roundTo(w / 2)) {
      if (w > 10000) continue // sanity check for huge images, note: webp can't save something greater than 16000x16000
      const resized = img.clone().resize(Math.min(6000, w), null, { kernel: 'mitchell' })
      // theoretically one call to .rotate() is supposed to fix orientation, but
      // there seems to be a bug in sharpjs where the rotation doesn't take
      // if there is a later resize to a sufficiently small size
      // this is a workaround to make sure the exif rotation is applied in all cases
      .flip(exifToFlip[orientation])
      .flop(exifToFlop[orientation])
      .rotate(exifToRotation[orientation])
      let webp: sharp.Sharp | undefined, webpsum: string | undefined, webpinfo: sharp.OutputInfo | undefined

      if (uselossless !== true) {
        webp = resized.clone().webp({ quality: 75, effort: 6, loop: info.loop ?? 0 })
        ;({ checksum: webpsum, info: webpinfo } = await fileHandler.sharpWrite(webp))
      }

      if (uselossless !== false) {
        // try making a lossless version and see whether it's acceptably small
        const lossless = resized.clone().webp({ quality: 60, effort: 6, loop: info.loop ?? 0, nearLossless: true })
        const { checksum: losslesssum, info: losslessinfo } = await fileHandler.sharpWrite(lossless)
        if (uselossless === true || losslessinfo.size < webpinfo!.size * 1.2) {
          if (webpsum) await cleanupBinaries([webpsum])
          webp = lossless
          webpsum = losslesssum
          webpinfo = losslessinfo
          uselossless = true
        } else {
          uselossless = false
          await cleanupBinaries([losslesssum])
        }
      }

      const outputformat = uselossless || animated || transparency
        ? (animated ? 'gif' : 'png')
        : 'jpg'
      const outputmime = lookup(outputformat) as string

      const formatted = outputformat === 'jpg'
        ? resized.clone().jpeg({ quality: 70 })
        : outputformat === 'png'
          ? resized.clone().png({ compressionLevel: 9, progressive: true })
          : resized.clone().gif({ effort: 10, reuse: false, loop: info.loop ?? 0 })
      const { checksum, info: outputinfo } = await fileHandler.sharpWrite(formatted)
      if (
        // this resize is too big and no more compatible than the original, abort!
        (outputinfo.size > (0.9 * binary.bytes) && ['image/jpeg', 'image/png', 'image/gif'].includes(binary.mime)) ||
        // this resize is somehow nearly as or larger than one of the greater-width resizes we've already made - skip it
        resizes.some(r => outputinfo.size > (0.9 * r.size) && outputmime === r.mime)
      ) {
        await cleanupBinaries([checksum])
      } else {
        // can't use outputinfo.height here because animations return the combined height of all the frames
        resizes.push({ width: outputinfo.width, height: outputinfo.width * (meta.height / meta.width), shasum: checksum, mime: outputmime, quality: outputformat === 'jpg' ? 70 : 0, size: outputinfo.size, lossless: outputformat !== 'jpg' })
      }

      if (resizes.some(r => webpinfo!.size > (0.9 * r.size) && webpinfo!.width <= r.width)) {
        // we already have a larger (in pixels) resize that somehow is smaller in file size than this - we should skip this
        await cleanupBinaries([webpsum!])
      } else {
        // can't use webpinfo!.height here because animations return the combined height of all the frames
        resizes.push({ width: webpinfo!.width, height: webpinfo!.width * (meta.height / meta.width), shasum: webpsum!, mime: 'image/webp', quality: 75, size: webpinfo!.size, lossless: uselossless })
      }
    }
    await db.transaction(async db => {
      await db.delete('DELETE r FROM resizes r INNER JOIN binaries b ON r.originalBinaryId=b.id WHERE b.shasum=?', [shasum])
      for (const r of resizes) {
        console.info('created resize of', shasum, 'with width', r.width, 'and format', r.mime)
        await registerResize(shasum, r.width, r.height, r.shasum, r.mime, r.quality, r.size, r.lossless, db)
      }
    }, { retries: 3 })
    await db.insert(`
      INSERT INTO migratedresizeinfo (originalChecksum, resizedChecksum, mime, size, quality, lossless, width, height)
        SELECT ob.shasum, b.shasum, b.mime, b.bytes, r.quality, IFNULL(JSON_EXTRACT(r.othersettings, '$.lossless') + 0, 0), r.width, r.height
        FROM resizes r
        INNER JOIN binaries b ON b.id=r.binaryId
        INNER JOIN binaries ob ON ob.id=r.originalBinaryId
        WHERE ob.shasum = ?
        ON DUPLICATE KEY UPDATE originalChecksum=originalChecksum
    `, [shasum])
  } catch (e: any) {
    await cleanupBinaries(resizes.map(r => r.shasum))
    throw e
  }
}

await db.wait()
console.info('Successfully connected to database.')
await beginProcessingResizes()
