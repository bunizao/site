import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installCloudflareDeployGuard,
  verifyCloudflareDeployArtifacts,
} from '../../scripts/cloudflare-deploy-guard.mjs';

const workspaces: string[] = [];
let errors: string[] = [];

function createWorkspace(html = '<a href="/blog/email-philosophy">Real post</a>') {
  const workspace = mkdtempSync(join(tmpdir(), 'cloudflare-deploy-guard-'));
  workspaces.push(workspace);
  mkdirSync(join(workspace, 'dist/client'), { recursive: true });
  mkdirSync(join(workspace, 'dist/server'), { recursive: true });
  writeFileSync(join(workspace, 'dist/client/blog.html'), html);
  writeFileSync(
    join(workspace, 'dist/server/wrangler.json'),
    '{"name":"site","legacy_env":true}\n',
  );
  return workspace;
}

beforeEach(() => {
  errors = [];
  spyOn(console, 'log').mockImplementation(() => {});
  spyOn(console, 'error').mockImplementation((message: string) => {
    errors.push(message);
  });
});

afterEach(() => {
  (console.log as unknown as { mockRestore(): void }).mockRestore();
  (console.error as unknown as { mockRestore(): void }).mockRestore();
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { force: true, recursive: true });
  }
});

describe('Cloudflare deploy guard', () => {
  test('installs a Wrangler pre-upload build hook', () => {
    const workspace = createWorkspace();
    installCloudflareDeployGuard(workspace);
    const config = JSON.parse(
      readFileSync(join(workspace, 'dist/server/wrangler.json'), 'utf8'),
    );

    expect(config.legacy_env).toBeUndefined();
    expect(config.build.command).toBe('node scripts/cloudflare-deploy-guard.mjs check');
  });

  test('accepts live blog artifacts after hook installation', () => {
    const workspace = createWorkspace();
    installCloudflareDeployGuard(workspace);

    expect(verifyCloudflareDeployArtifacts(workspace)).toBe(true);
  });

  test('blocks fixture blog artifacts before upload', () => {
    const workspace = createWorkspace(
      '<a href="/blog/demo-effects">Mock</a><a href="/blog/quiet-architecture">Mock</a>',
    );
    installCloudflareDeployGuard(workspace);

    expect(verifyCloudflareDeployArtifacts(workspace)).toBe(false);
    expect(errors.join('\n')).toContain('Cloudflare deploy blocked mock Ghost posts: demo-effects, quiet-architecture');
  });

  test('does not block a real slug that only shares a mock prefix', () => {
    const workspace = createWorkspace('<a href="/blog/demo-effects-retrospective">Real post</a>');
    installCloudflareDeployGuard(workspace);

    expect(verifyCloudflareDeployArtifacts(workspace)).toBe(true);
  });

  // A Ghost outage at build time renders a blog index with tag links but no
  // posts; shipping it would blank the live blog.
  test('blocks a blog artifact that links only to tag pages', () => {
    const workspace = createWorkspace('<a href="/blog/tag/notes">Notes</a><a href="/blog/tags">Tags</a>');
    installCloudflareDeployGuard(workspace);

    expect(verifyCloudflareDeployArtifacts(workspace)).toBe(false);
    expect(errors.join('\n')).toContain('Cloudflare deploy blocked an empty blog artifact');
  });

  test('blocks artifacts that omit the upload hook', () => {
    const workspace = createWorkspace();

    expect(verifyCloudflareDeployArtifacts(workspace)).toBe(false);
    expect(errors.join('\n')).toContain('missing the production content guard');
  });
});
