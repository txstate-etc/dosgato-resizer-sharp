# dosgato-resizer-sharp
Self-contained service to connect to a DosGato CMS database and file store and process the requestedresizes queue.

# Testing
Run `./test.sh` (requires docker). It brings up the full stack with docker-compose.test.yml:
  * `mysql` - mariadb with the four tables the resizer touches (DDL copied from dosgato's `src/createdb.ts`) and seed rows covering an opaque PNG, a transparent PNG, a pre-migrated binary, a missing file, an SVG and a PDF
  * `seed-files` - places the files in `test/files/` into the shared files volume at their sharded checksum paths and creates `/files/tmp`, then stays alive (reporting healthy) so compose's `--abort-on-container-exit` doesn't tear the stack down
  * `resizer` - this service, built from the production Dockerfile, with `DOSGATO_MIGRATION=true` so the migration short-circuit is exercised alongside the normal path
  * `testing-container` - Playwright tests that poll the `requestedresizes` queue until it settles, then assert on the `resizes`/`binaries`/`migratedresizeinfo` rows, the resized files on disk, the error/skip paths, and re-queue idempotency

The first run is slow because the production image builds libvips from source. JUnit results land in `test/test-results/results.xml`. If an image in `test/files/` is ever regenerated, update its shasum/bytes in `test/mysql-init/01-schema.sql` and `test/tests/common.ts`.

# Scoped MySQL user
For extra security, make a separate MySQL user for this container and give it the following access:
  * GRANT SELECT, INSERT ON dosgato.binaries TO ...
  * GRANT SELECT, INSERT, UPDATE, DELETE ON dosgato.resizes TO ...
  * GRANT SELECT, UPDATE ON dosgato.requestedresizes TO ...
  * GRANT SELECT, INSERT ON dosgato.migratedresizeinfo TO ...
