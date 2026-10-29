import mysql from 'mysql2/promise'

// Must match test/mysql-init/01-schema.sql and test/files/original.png.
export const pngChecksum = '0scB5aexuTMmy0T63kdfx9z0F6k4AMJE1Gn-gJAp2zw'
export const pngBinaryId = 1
export const pngWidth = 200
export const pngHeight = 150
export const pngBytes = 81249
export const svgChecksum = 'svgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvgsvg0'
export const svgBinaryId = 2
export const migratedBinaryId = 3
export const migratedOriginalChecksum = 'migmigmigmigmigmigmigmigmigmigmigmigmigmig0'
export const migratedResizedChecksum = 'Dsf8PGCGqCdzVeMbR_jRd7esnfEsIQ1e_wMvd3V8HtY'
export const migratedResizedBytes = 800
export const missingFileBinaryId = 4
export const transparentBinaryId = 5
export const transparentChecksum = 'sDNqNsYP75GyV90HmCs04cbCWQJ52cH-uewcbNVKLQk'
export const transparentWidth = 160
export const transparentHeight = 120
export const pdfBinaryId = 6
export const animatedGifBinaryId = 7
export const animatedWebpBinaryId = 8
export const animatedWebpBytes = 5642
// both animations are 4 frames of 200x150 with these per-frame delays (ms)
export const animatedWidth = 200
export const animatedHeight = 150
export const animatedPages = 4
export const animatedDelay = [100, 200, 300, 400]
// landscape_1..8.jpg are binaries 9-16 and portrait_1..8.jpg are 17-24, where
// the number is the EXIF orientation; all should display upright at these
// dimensions
export const orientationSamples = (['landscape', 'portrait'] as const).flatMap((shape, s) =>
  [1, 2, 3, 4, 5, 6, 7, 8].map(orientation => ({
    shape,
    orientation,
    binaryId: 9 + s * 8 + orientation - 1,
    width: shape === 'landscape' ? 600 : 450,
    height: shape === 'landscape' ? 450 : 600
  })))
// photo.heic is landscape_1.jpg (binary 9) re-encoded as HEIC
export const heicBinaryId = 25
export const heicWidth = 600
export const heicHeight = 450
export const seededBinaryCount = 25

// binary 4's original file is deliberately missing, so the resizer is
// expected to flag it withError=1 rather than complete it
export const expectedErrorIds = new Set([missingFileBinaryId])

export const pool = mysql.createPool({
  host: 'mysql',
  user: 'user',
  password: 'password',
  database: 'dosgato',
  connectionLimit: 2
})

export async function getall<T> (sql: string, binds: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, binds)
  return rows as T[]
}

export interface RequestedResizeRow {
  binaryId: number
  started: Date | null
  completed: Date | null
  withError: number
}

export interface ResizeRow {
  binaryId: number
  originalBinaryId: number
  width: number
  height: number
  quality: number
  othersettings: any
  shasum: string
  mime: string
  bytes: number
}

/**
 * Poll the requestedresizes queue until every seeded row is settled:
 * completed, or flagged withError=1 for the binaries we expect to fail
 * (expectedErrorIds). Fails fast if any other row errors since the resizer
 * never retries those on its own. Cheap after the first call.
 */
export async function waitForQueueDrained (): Promise<RequestedResizeRow[]> {
  const deadline = Date.now() + 210_000
  let rows: RequestedResizeRow[] = []
  while (true) {
    rows = await getall<RequestedResizeRow>('SELECT * FROM requestedresizes')
    const unexpected = rows.filter(r => r.withError && !expectedErrorIds.has(r.binaryId))
    if (unexpected.length) {
      throw new Error('Resizer flagged a queue entry withError=1. Check the resizer container logs. Queue state: ' + JSON.stringify(rows, null, 2))
    }
    if (rows.length && rows.every(r => r.completed != null || (r.withError && expectedErrorIds.has(r.binaryId)))) return rows
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the requestedresizes queue to drain. Queue state: ' + JSON.stringify(rows, null, 2))
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

/** Fetch the resize rows for an original binary, joined with their binaries entries. */
export async function getResizes (originalBinaryId: number): Promise<ResizeRow[]> {
  const rows = await getall<ResizeRow>(`
    SELECT r.*, b.shasum, b.mime, b.bytes FROM resizes r
    INNER JOIN binaries b ON b.id=r.binaryId
    WHERE r.originalBinaryId=?
    ORDER BY r.width DESC, b.mime
  `, [originalBinaryId])
  // mariadb JSON columns come back from mysql2 as strings
  for (const row of rows) {
    if (typeof row.othersettings === 'string') row.othersettings = JSON.parse(row.othersettings)
  }
  return rows
}

/** The sharded path FileSystemHandler uses inside the files volume. */
export function storagePath (checksum: string) {
  return `/files/storage/${checksum.slice(0, 1)}/${checksum.slice(1, 2)}/${checksum.slice(2)}`
}
