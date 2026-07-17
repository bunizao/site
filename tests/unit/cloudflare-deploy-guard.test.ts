import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const guardScript = join(root, 'scripts/cloudflare-deploy-guard.mjs');
const workspaces: string[] = [];

function createWorkspace(html = '<a href="/blog/email-philosophy/">Real post</a>') {
  const workspace = mkdtempSync(join(tmpdir(), 'cloudflare-deploy-guard-'));
  workspaces.push(workspace);
  mkdirSync(join(workspace, 'dist/client/blog'), { recursive: true });
  mkdirSync(join(workspace, 'dist/server'), { recursive: true });
  writeFileSync(join(workspace, 'dist/client/blog/index.html'), html);
  writeFileSync(join(workspace, 'dist/server/wrangler.json'), '{"name":"site"}\n');
  return workspace;
}

function runGuard(workspace: string, mode: 'check' | 'install') {
  const result = Bun.spawnSync(['node', guardScript, mode], { cwd: workspace });
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

describe('Cloudflare deploy guard', () => {
  test('installs a Wrangler pre-upload build hook', () => {
    const workspace = createWorkspace();
    const result = runGuard(workspace, 'install');
    const config = JSON.parse(
      readFileSync(join(workspace, 'dist/server/wrangler.json'), 'utf8'),
    );

    expect(result.exitCode).toBe(0);
    expect(config.build.command).toBe('node scripts/cloudflare-deploy-guard.mjs check');
  });

  test('accepts live blog artifacts after hook installation', () => {
    const workspace = createWorkspace();
    runGuard(workspace, 'install');
    const result = runGuard(workspace, 'check');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cloudflare deploy guard passed');
  });

  test('blocks fixture blog artifacts before upload', () => {
    const workspace = createWorkspace(
      '<a href="/blog/demo-effects/">Mock</a><a href="/blog/quiet-architecture/">Mock</a>',
    );
    runGuard(workspace, 'install');
    const result = runGuard(workspace, 'check');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cloudflare deploy blocked mock Ghost posts');
    expect(result.stderr).toContain('demo-effects, quiet-architecture');
  });

  test('blocks artifacts that omit the upload hook', () => {
    const workspace = createWorkspace();
    const result = runGuard(workspace, 'check');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('missing the production content guard');
  });
});
