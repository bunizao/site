import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const summaryScript = join(root, '.github/scripts/summarize-lighthouse.mjs');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function runSummary(deprecationUrls: string[]) {
  const workspace = mkdtempSync(join(tmpdir(), 'lighthouse-summary-'));
  temporaryDirectories.push(workspace);
  const lighthouseDirectory = join(workspace, '.lighthouseci');
  mkdirSync(lighthouseDirectory);

  const reportPath = join(lighthouseDirectory, 'report.json');
  const url = 'https://buxx.me/';
  const report = {
    finalDisplayedUrl: url,
    categories: {
      performance: { score: 1 },
      accessibility: { score: 1 },
      'best-practices': {
        score: 0.82,
        auditRefs: [
          { id: 'deprecations', weight: 5 },
          { id: 'errors-in-console', weight: 1 },
        ],
      },
      seo: { score: 1 },
    },
    audits: {
      deprecations: {
        score: 0,
        details: { items: deprecationUrls.map((sourceUrl) => ({ source: { url: sourceUrl } })) },
      },
      'errors-in-console': { score: 1 },
      'first-contentful-paint': { numericValue: 1000 },
      'largest-contentful-paint': { numericValue: 2000 },
      'total-blocking-time': { numericValue: 0 },
      'cumulative-layout-shift': { numericValue: 0 },
    },
  };

  writeFileSync(reportPath, JSON.stringify(report));
  writeFileSync(join(lighthouseDirectory, 'manifest.json'), JSON.stringify([{ url, jsonPath: reportPath }]));

  const process = Bun.spawnSync(['node', summaryScript], { cwd: workspace });
  expect(process.exitCode).toBe(0);

  return {
    result: JSON.parse(readFileSync(join(lighthouseDirectory, 'summary.json'), 'utf8')) as { anomaly: boolean },
    summary: readFileSync(join(lighthouseDirectory, 'summary.md'), 'utf8'),
  };
}

describe('Lighthouse summary', () => {
  test('keeps Cloudflare Bot Fight Mode JSD deprecations visible without alerting', () => {
    const output = runSummary([
      'https://buxx.me/cdn-cgi/challenge-platform/scripts/jsd/main.js',
    ]);

    expect(output.result.anomaly).toBe(false);
    expect(output.summary).toContain('✅ 82 raw (100 gated)');
  });

  test('alerts when any deprecation is not from Cloudflare JSD', () => {
    const output = runSummary([
      'https://buxx.me/cdn-cgi/challenge-platform/scripts/jsd/main.js',
      'https://buxx.me/_astro/application.js',
    ]);

    expect(output.result.anomaly).toBe(true);
    expect(output.summary).toContain('Best Practices 82 < 90');
  });

  test('does not exempt a lookalike JSD path from another host', () => {
    const output = runSummary([
      'https://example.com/cdn-cgi/challenge-platform/scripts/jsd/main.js',
    ]);

    expect(output.result.anomaly).toBe(true);
  });
});
