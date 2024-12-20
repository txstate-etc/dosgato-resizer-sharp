import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, constants, mkdir, rename, unlink } from 'node:fs/promises'
import { nanoid } from 'nanoid'
import { dirname } from 'node:path'
import sharp from 'sharp'
import { type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { rescue } from 'txstate-utils'

interface FileHandler {
  init: () => Promise<void>
  put: (stream: Readable) => Promise<{ checksum: string, size: number }> // returns a checksum
  get: (checksum: string) => Readable
  sharp: (checksum: string, opts?: sharp.SharpOptions) => sharp.Sharp
  sharpWrite: (img: sharp.Sharp) => Promise<{ checksum: string, info: sharp.OutputInfo }> // returns a checksum
  remove: (checksum: string) => Promise<void>
}

class FileSystemHandler implements FileHandler {
  #getTmpLocation () {
    return `/files/tmp/${nanoid()}`
  }

  #getFileLocation (checksum: string) {
    return `/files/storage/${checksum.slice(0, 1)}/${checksum.slice(1, 2)}/${checksum.slice(2)}`
  }

  async #moveToPerm (tmp: string, checksum: string) {
    const checksumpath = this.#getFileLocation(checksum)
    await mkdir(dirname(checksumpath), { recursive: true })
    await rename(tmp, checksumpath)
  }

  async init () {
    await mkdir('/files/tmp', { recursive: true })
    await mkdir('/files/storage', { recursive: true })
  }

  get (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    const stream = createReadStream(filepath)
    return stream
  }

  async exists (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    return (await rescue(access(filepath, constants.R_OK), false)) ?? true
  }

  async put (stream: Readable) {
    const tmp = this.#getTmpLocation()
    const hash = createHash('sha256')
    let size = 0
    stream.on('data', (data: Buffer) => { hash.update(data); size += data.length })
    try {
      const out = createWriteStream(tmp)
      const flushedPromise = new Promise((resolve, reject) => {
        out.on('close', resolve)
        out.on('error', reject)
      })
      await pipeline(stream, out)
      await flushedPromise
      const checksum = hash.digest('base64url')
      const rereadhash = createHash('sha256')
      const read = createReadStream(tmp)
      for await (const chunk of read) {
        rereadhash.update(chunk as Buffer)
      }
      const rereadsum = rereadhash.digest('base64url')
      if (rereadsum !== checksum) throw new Error('File did not write to disk correctly. Please try uploading again.')
      await this.#moveToPerm(tmp, checksum)
      return { checksum, size }
    } catch (e: any) {
      await rescue(unlink(tmp))
      throw e
    }
  }

  sharp (checksum: string, opts?: sharp.SharpOptions) {
    const filepath = this.#getFileLocation(checksum)
    return sharp(filepath, opts)
  }

  async sharpWrite (img: sharp.Sharp) {
    const tmp = this.#getTmpLocation()
    const hash = createHash('sha256', { encoding: 'base64url' })
    try {
      await pipeline(img.clone(), hash)
      const checksum = hash.read() as string
      const info = await img.toFile(tmp)
      const rereadhash = createHash('sha256')
      const read = createReadStream(tmp)
      for await (const chunk of read) {
        rereadhash.update(chunk as Buffer)
      }
      const rereadsum = rereadhash.digest('base64url')
      if (rereadsum !== checksum) throw new Error('File did not write to disk correctly during sharpjs resize operation.')
      await this.#moveToPerm(tmp, checksum)
      return { checksum, info }
    } catch (e: any) {
      await rescue(unlink(tmp))
      throw e
    }
  }

  async remove (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    try {
      await unlink(filepath)
    } catch (e: any) {
      if (e.code === 'ENOENT') console.warn('Tried to delete file with checksum', checksum, 'but it did not exist.')
      else console.warn(e)
    }
  }
}

export const fileHandler = new FileSystemHandler()
