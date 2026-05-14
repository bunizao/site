import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test as base } from '@playwright/test';

const COVERAGE_DIR = path.resolve(process.cwd(), '.nyc_output');
const isCoverageEnabled = process.env.COVERAGE === '1';

function toSafeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'test';
}

async function writePageCoverage(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  pageIndex: number
): Promise<void> {
  const coverage = await page
    .evaluate(() => (globalThis as { __coverage__?: Record<string, unknown> }).__coverage__ ?? null)
    .catch(() => null);

  if (!coverage || Object.keys(coverage).length === 0) {
    return;
  }

  mkdirSync(COVERAGE_DIR, { recursive: true });

  const title = toSafeSlug(testInfo.titlePath.slice(1).join('-'));
  const project = toSafeSlug(testInfo.project.name);
  const fileName = `${project}-${title}-retry${testInfo.retry}-page${pageIndex}-${randomUUID()}.json`;

  writeFileSync(path.join(COVERAGE_DIR, fileName), JSON.stringify(coverage), 'utf8');
}

export const test = base.extend({
  context: async ({ context }, runFixture, testInfo) => {
    await runFixture(context);

    if (!isCoverageEnabled) {
      return;
    }

    const pages = context.pages();
    for (const [pageIndex, page] of pages.entries()) {
      await writePageCoverage(page, testInfo, pageIndex);
    }
  },
});

export { expect };
