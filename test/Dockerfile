# Pin the Playwright image so the preinstalled runner always matches the
# @playwright/test version in test/package.json.
FROM mcr.microsoft.com/playwright:v1.64.1

COPY test/package.json ./
RUN npm --quiet install
COPY test/tsconfig.json ./
COPY test/playwright.config.ts ./
COPY test/tests tests

CMD npm run playwright
