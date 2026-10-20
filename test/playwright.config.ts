import type { PlaywrightTestConfig } from '@playwright/test'

// No webServer block: the resizer, mariadb and the file-store seeder are
// brought up by docker-compose.test.yml. The resizer is a long-running queue
// worker, so readiness is handled in the tests themselves by polling the
// requestedresizes table until every seeded row is completed (see
// tests/common.ts).
const config: PlaywrightTestConfig = {
  testDir: 'tests',
  testMatch: /(.+\.)?(test|spec)\.[jt]s/,
  // All tests assert against the single shared queue run; run serially.
  workers: 1,
  // The first test may wait through mariadb init plus the full set of sharp
  // resize operations, so give each test room to poll.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  // Keep Playwright's own artifact scratch dir away from the mounted
  // /test-results dir, which it would otherwise wipe on every run.
  outputDir: '/tmp/playwright-artifacts',
  reporter: [['list'], ['junit', { outputFile: '/test-results/results.xml' }]]
}

export default config
