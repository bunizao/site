import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const root = join(import.meta.dir, '../..');
const workspaces: string[] = [];
const stubBunSource = `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');

const blogHtml = process.env.STUB_BLOG_HTML
  || '<a href="/blog/email-philosophy/">Real post</a>';

mkdirSync('dist/client/blog', { recursive: true });
mkdirSync('dist/server', { recursive: true });
writeFileSync('dist/client/blog/index.html', blogHtml);
writeFileSync('dist/server/wrangler.json', JSON.stringify({
  build: { command: 'node scripts/cloudflare-deploy-guard.mjs check' },
}));
console.log(JSON.stringify({
  args: process.argv.slice(2),
  e2eFixture: process.env.E2E_SITE_FIXTURE,
  ghostMock: process.env.GHOST_MOCK_CONTENT,
}));
`;

function runCloudflareBuild(overrides: Record<string, string> = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'cloudflare-build-'));
  const binDirectory = join(workspace, 'bin');
  const bunPath = join(binDirectory, 'bun');
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string'
    )),
  );

  workspaces.push(workspace);
  mkdirSync(binDirectory);
  writeFileSync(bunPath, stubBunSource);
  chmodSync(bunPath, 0o755);

  for (const name of [
    'E2E_SITE_FIXTURE',
    'GHOST_CONTENT_API_KEY',
    'GHOST_CONTENT_APIKEY',
    'GHOST_MOCK_CONTENT',
    'PUBLIC_GHOST_URL',
    'STUB_BLOG_HTML',
    'WORKERS_CI',
    'WORKERS_CI_BRANCH',
  ]) {
    delete env[name];
  }

  Object.assign(env, overrides, {
    PATH: `${binDirectory}${delimiter}${env.PATH ?? ''}`,
  });

  const result = Bun.spawnSync(
    ['node', join(root, 'scripts/build-cloudflare.mjs')],
    { cwd: workspace, env },
  );

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { force: true, recursive: true });
  }
});

describe('Cloudflare build guard', () => {
  test('accepts blog.buxx.me as the Ghost origin', () => {
    const result = runCloudflareBuild({
      GHOST_CONTENT_API_KEY: 'test-key',
      PUBLIC_GHOST_URL: 'https://blog.buxx.me',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"args":["run","build"]');
    expect(result.stdout).toContain('"e2eFixture":"0"');
    expect(result.stdout).toContain('"ghostMock":"0"');
  });

  test('fails closed without Ghost secrets on any Workers branch', () => {
    const result = runCloudflareBuild({
      WORKERS_CI: '1',
      WORKERS_CI_BRANCH: 'release-v2',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing Cloudflare build-time Ghost environment variables');
    expect(result.stdout).not.toContain('"args":["run","build"]');
  });

  test('rejects a Ghost origin routed to the site Worker', () => {
    const result = runCloudflareBuild({
      GHOST_CONTENT_API_KEY: 'test-key',
      PUBLIC_GHOST_URL: 'https://buxx.me',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('PUBLIC_GHOST_URL points at buxx.me');
    expect(result.stdout).not.toContain('"args":["run","build"]');
  });

  test('rejects mock content in deployment builds', () => {
    const result = runCloudflareBuild({
      GHOST_CONTENT_API_KEY: 'test-key',
      GHOST_MOCK_CONTENT: '1',
      PUBLIC_GHOST_URL: 'https://blog.buxx.me',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Mock Ghost content is disabled for Cloudflare builds');
    expect(result.stdout).not.toContain('"args":["run","build"]');
  });

  test('rejects a successful build containing mock posts', () => {
    const result = runCloudflareBuild({
      GHOST_CONTENT_API_KEY: 'test-key',
      PUBLIC_GHOST_URL: 'https://blog.buxx.me',
      STUB_BLOG_HTML: '<a href="/blog/demo-effects/">Mock post</a>',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cloudflare deploy blocked mock Ghost posts: demo-effects');
  });
});
