import { expect, test } from '@playwright/test'
import { stat } from 'node:fs/promises'
import {
  expectedErrorIds, getall, getResizes, migratedBinaryId, migratedResizedBytes,
  migratedResizedChecksum, missingFileBinaryId, pdfBinaryId, pngBinaryId,
  pngBytes, pngChecksum, pngHeight, pngWidth, pool, seededBinaryCount,
  storagePath, svgBinaryId, transparentBinaryId, transparentHeight,
  transparentWidth, waitForQueueDrained
} from './common.js'

test.afterAll(async () => {
  await pool.end()
})

test('settles every queue entry, erroring only on the missing file', async () => {
  const rows = await waitForQueueDrained()
  expect(rows).toHaveLength(seededBinaryCount)
  for (const row of rows) {
    if (expectedErrorIds.has(row.binaryId)) continue
    expect(row.completed, `binaryId ${row.binaryId}`).not.toBeNull()
    expect(row.withError, `binaryId ${row.binaryId}`).toBe(0)
  }
})

test('creates jpeg and webp resizes at halving widths for the png', async () => {
  await waitForQueueDrained()
  const resizes = await getResizes(pngBinaryId)

  // 200 wide original halves down to 50: 200, 100, 50, each as jpeg + webp —
  // except webp 200: the test image is noisy enough that the full-size webp
  // (q75) comes out larger than 0.9x the jpeg (q70) at the same width, so the
  // resizer's skip rule discards it. Deterministic since sharp/libvips are
  // pinned, and it exercises that branch.
  const expected = new Set(['image/jpeg 200', 'image/jpeg 100', 'image/jpeg 50', 'image/webp 100', 'image/webp 50'])
  expect(new Set(resizes.map(r => `${r.mime} ${r.width}`))).toEqual(expected)

  for (const r of resizes) {
    // height stays proportional (MySQL rounds 50 * 150/200 = 37.5 to 38)
    expect(Math.abs(r.height - r.width * (pngHeight / pngWidth))).toBeLessThanOrEqual(0.5)
    expect(r.quality).toBe(r.mime === 'image/jpeg' ? 70 : 75)
    expect(r.othersettings.lossless).toBe(false)
    // every resize should be meaningfully smaller than the original
    expect(r.bytes).toBeGreaterThan(0)
    expect(r.bytes).toBeLessThan(0.9 * pngBytes)
  }
})

test('writes each resize to the sharded file store', async () => {
  await waitForQueueDrained()
  const resizes = await getResizes(pngBinaryId)
  expect(resizes.length).toBeGreaterThan(0)
  for (const r of resizes) {
    const info = await stat(storagePath(r.shasum))
    expect(info.size).toBe(r.bytes)
  }
})

test('records migratedresizeinfo for every resize', async () => {
  await waitForQueueDrained()
  const resizes = await getResizes(pngBinaryId)
  const migrated = await getall<{ resizedChecksum: string, mime: string, size: number, quality: number, lossless: number, width: number, height: number }>(
    'SELECT * FROM migratedresizeinfo WHERE originalChecksum=?', [pngChecksum])
  expect(new Set(migrated.map(m => m.resizedChecksum))).toEqual(new Set(resizes.map(r => r.shasum)))
  for (const m of migrated) {
    const r = resizes.find(r => r.shasum === m.resizedChecksum)!
    expect(m.mime).toBe(r.mime)
    expect(m.size).toBe(r.bytes)
    expect(m.quality).toBe(r.quality)
    expect(m.lossless).toBe(0)
    expect(m.width).toBe(r.width)
    expect(m.height).toBe(r.height)
  }
})

test('produces png instead of jpeg for an image with transparency', async () => {
  await waitForQueueDrained()
  const resizes = await getResizes(transparentBinaryId)

  // 160 wide original halves once to 80 (40 is below the 50px floor). The
  // full-width png re-encode comes out near the original's size, so the
  // resizer's "too big and no more compatible" rule drops it; the halved png
  // and both webps survive. Deterministic since sharp/libvips are pinned.
  expect(new Set(resizes.map(r => `${r.mime} ${r.width}`))).toEqual(new Set(['image/webp 160', 'image/png 80', 'image/webp 80']))
  for (const r of resizes) {
    expect(Math.abs(r.height - r.width * (transparentHeight / transparentWidth))).toBeLessThanOrEqual(0.5)
    const info = await stat(storagePath(r.shasum))
    expect(info.size).toBe(r.bytes)
    if (r.mime === 'image/png') {
      expect(r.quality).toBe(0)
      expect(r.othersettings.lossless).toBe(true)
    } else {
      expect(r.quality).toBe(75)
      expect(r.othersettings.lossless).toBe(false)
    }
  }
})

test('registers pre-migrated resizes without reading the original', async () => {
  await waitForQueueDrained()
  // binary 3's original file does not exist, so completing proves the
  // DOSGATO_MIGRATION branch registered the seeded migratedresizeinfo row
  // instead of resizing
  const resizes = await getResizes(migratedBinaryId)
  expect(resizes).toHaveLength(1)
  expect(resizes[0].shasum).toBe(migratedResizedChecksum)
  expect(resizes[0].mime).toBe('image/webp')
  expect(resizes[0].bytes).toBe(migratedResizedBytes)
  expect(resizes[0].width).toBe(100)
  expect(resizes[0].height).toBe(75)
  expect(resizes[0].quality).toBe(75)
  expect(Boolean(resizes[0].othersettings.lossless)).toBe(false)
})

test('flags a missing original withError=1 and never completes it', async () => {
  const rows = await waitForQueueDrained()
  const row = rows.find(r => r.binaryId === missingFileBinaryId)!
  expect(row.withError).toBe(1)
  expect(row.completed).toBeNull()
  expect(row.started).not.toBeNull()
  expect(await getResizes(missingFileBinaryId)).toHaveLength(0)
})

test('skips the svg and the pdf without erroring and without creating resizes', async () => {
  await waitForQueueDrained()
  expect(await getResizes(svgBinaryId)).toHaveLength(0)
  expect(await getResizes(pdfBinaryId)).toHaveLength(0)
  // no stray binaries were registered either: the six seeded originals, one
  // row per resize of the two real images, and the registered migrated resize
  const pngResizes = await getResizes(pngBinaryId)
  const transparentResizes = await getResizes(transparentBinaryId)
  const binaries = await getall<{ id: number }>('SELECT id FROM binaries')
  expect(binaries).toHaveLength(seededBinaryCount + pngResizes.length + transparentResizes.length + 1)
})

test('re-queueing an already-processed binary is idempotent', async () => {
  await waitForQueueDrained()
  const before = await getResizes(pngBinaryId)
  const binariesBefore = await getall<{ id: number }>('SELECT id FROM binaries')

  // reset the queue entry the way the dosgato API would when asked to redo a
  // resize; with DOSGATO_MIGRATION=true the first pass's migratedresizeinfo
  // rows short-circuit the reprocess
  await pool.query('UPDATE requestedresizes SET started=NULL, completed=NULL WHERE binaryId=?', [pngBinaryId])
  const rows = await waitForQueueDrained()
  expect(rows.find(r => r.binaryId === pngBinaryId)!.completed).not.toBeNull()

  const after = await getResizes(pngBinaryId)
  expect(new Set(after.map(r => `${r.mime} ${r.width} ${r.shasum}`)))
    .toEqual(new Set(before.map(r => `${r.mime} ${r.width} ${r.shasum}`)))
  const binariesAfter = await getall<{ id: number }>('SELECT id FROM binaries')
  expect(binariesAfter).toHaveLength(binariesBefore.length)
})
