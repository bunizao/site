import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function runCoverage(apiRepo?: string) {
  const command = ['bun', 'scripts/check-docs-coverage.ts'];
  if (apiRepo) command.push(apiRepo);
  return Bun.spawnSync(command, {
    cwd: resolve(import.meta.dir, '../..'),
  });
}

// The /docs API reference is the only public description of these routes, so a
// route landing without a doc line is a regression. The guard degrades on its
// own when ../site-api is absent, so this passes in a checkout of `site` alone
// and covers both Workers on a dev machine that has the sibling repo.
describe('docs route coverage', () => {
  test('every route module is mentioned under src/content/docs', async () => {
    const result = runCoverage();
    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    expect(output).toBeTruthy();
    if (result.exitCode !== 0) throw new Error(output);
  });

  test('checks an explicitly supplied site-api route tree', () => {
    const siteApi = mkdtempSync(join(tmpdir(), 'site-api-docs-'));
    const pages = join(siteApi, 'src/pages');
    mkdirSync(pages, { recursive: true });

    try {
      writeFileSync(join(pages, 'footer.ts'), 'export const GET = () => new Response();\n');
      const covered = runCoverage(siteApi);
      expect(covered.exitCode).toBe(0);
      expect(covered.stdout.toString()).not.toContain('skipping that half');

      writeFileSync(join(pages, 'undocumented-probe.ts'), 'export const GET = () => new Response();\n');
      const missing = runCoverage(siteApi);
      expect(missing.exitCode).toBe(1);
      expect(missing.stderr.toString()).toContain('/api/undocumented-probe');
    } finally {
      rmSync(siteApi, { recursive: true, force: true });
    }
  });

  test('fails when an explicit site-api path has no routes', () => {
    const missingRepo = join(tmpdir(), `missing-site-api-${process.pid}`);
    rmSync(missingRepo, { recursive: true, force: true });

    const result = runCoverage(missingRepo);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No site-api routes found');
  });
});
