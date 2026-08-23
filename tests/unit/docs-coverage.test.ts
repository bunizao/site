import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The /docs API reference is the only public description of these routes, so a
// route landing without a doc line is a regression. The guard degrades on its
// own when ../site-api is absent, so this passes in a checkout of `site` alone
// and covers both Workers on a dev machine that has the sibling repo.
describe('docs route coverage', () => {
  test('every route module is mentioned under src/content/docs', async () => {
    const result = Bun.spawnSync(['bun', 'scripts/check-docs-coverage.ts'], {
      cwd: resolve(import.meta.dir, '../..'),
    });
    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    expect(output).toBeTruthy();
    if (result.exitCode !== 0) throw new Error(output);
  });

  test('covers both Workers when the sibling repo is present', () => {
    const siteApi = resolve(import.meta.dir, '../../../site-api/src/pages');
    if (!existsSync(siteApi)) return;

    const result = Bun.spawnSync(['bun', 'scripts/check-docs-coverage.ts'], {
      cwd: resolve(import.meta.dir, '../..'),
    });
    expect(result.stdout.toString()).not.toContain('skipping that half');
  });
});
