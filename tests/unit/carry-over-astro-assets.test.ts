import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSET_LIST_FILE, carryOverAstroAssets } from '../../scripts/carry-over-astro-assets.mjs';

const ORIGIN = 'https://live.example';
const workspaces: string[] = [];

function createBuild(files: string[]): string {
  const clientDir = mkdtempSync(join(tmpdir(), 'asset-carry-over-'));
  workspaces.push(clientDir);
  mkdirSync(join(clientDir, '_astro'));
  for (const name of files) writeFileSync(join(clientDir, '_astro', name), `new ${name}`);
  return clientDir;
}

function liveSite(routes: Record<string, Response | (() => Response)>) {
  const requested: string[] = [];
  const fetchImpl = async (input: URL | string) => {
    const path = new URL(input).pathname;
    requested.push(path);
    const route = routes[path];
    if (!route) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    return typeof route === 'function' ? route() : route;
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requested };
}

afterEach(() => {
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { force: true, recursive: true });
});

describe('carryOverAstroAssets', () => {
  test('copies live files the new build lacks and lists only its own files', async () => {
    const clientDir = createBuild(['index.NEW.css', 'shared.SAME.js']);
    const { fetchImpl, requested } = liveSite({
      [`/${ASSET_LIST_FILE}`]: () => Response.json(['index.OLD.css', 'shared.SAME.js']),
      '/_astro/index.OLD.css': () => new Response('old css'),
    });

    const result = await carryOverAstroAssets({ origin: ORIGIN, clientDir, fetchImpl });

    expect(result).toEqual({ carried: 1, failed: 0 });
    expect(readFileSync(join(clientDir, '_astro/index.OLD.css'), 'utf8')).toBe('old css');
    expect(readFileSync(join(clientDir, '_astro/shared.SAME.js'), 'utf8')).toBe('new shared.SAME.js');
    expect(requested).not.toContain('/_astro/shared.SAME.js');
    expect(JSON.parse(readFileSync(join(clientDir, ASSET_LIST_FILE), 'utf8')))
      .toEqual(['index.NEW.css', 'shared.SAME.js']);
  });

  test('deploys without carry-over when the live list is missing', async () => {
    const clientDir = createBuild(['index.NEW.css']);
    const { fetchImpl } = liveSite({});

    const result = await carryOverAstroAssets({ origin: ORIGIN, clientDir, fetchImpl });

    expect(result).toEqual({ carried: 0, failed: 0 });
    expect(readdirSync(join(clientDir, '_astro'))).toEqual(['index.NEW.css']);
    expect(existsSync(join(clientDir, ASSET_LIST_FILE))).toBe(true);
  });

  test('skips unsafe names and counts failed fetches without throwing', async () => {
    const clientDir = createBuild(['index.NEW.css']);
    const { fetchImpl, requested } = liveSite({
      [`/${ASSET_LIST_FILE}`]: () => Response.json(['../escape.js', '..', 'gone.OLD.js', 42]),
    });

    const result = await carryOverAstroAssets({ origin: ORIGIN, clientDir, fetchImpl });

    expect(result).toEqual({ carried: 0, failed: 1 });
    expect(requested).toEqual([`/${ASSET_LIST_FILE}`, '/_astro/gone.OLD.js']);
    expect(readdirSync(join(clientDir, '_astro'))).toEqual(['index.NEW.css']);
  });
});
