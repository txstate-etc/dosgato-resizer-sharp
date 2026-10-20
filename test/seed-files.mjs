// One-shot seeder for the docker-compose test stack. Copies every file in
// /seed into the shared files volume at the sharded path the resizer's
// FileSystemHandler expects (/files/storage/<c0>/<c1>/<rest of checksum>),
// computing each file's sha256 base64url checksum so the path can never
// drift from the file contents. The checksums themselves are hardcoded in
// test/mysql-init/01-schema.sql and test/tests/common.ts.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// the resizer writes resize output to /files/tmp but never creates the dir
await mkdir('/files/tmp', { recursive: true })

for (const name of await readdir('/seed')) {
  const src = join('/seed', name)
  const checksum = createHash('sha256').update(await readFile(src)).digest('base64url')
  const dir = `/files/storage/${checksum.slice(0, 1)}/${checksum.slice(1, 2)}`
  await mkdir(dir, { recursive: true })
  await copyFile(src, `${dir}/${checksum.slice(2)}`)
  console.info(`seeded ${name} as ${checksum}`)
}
