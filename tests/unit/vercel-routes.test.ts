import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type VercelRoute = {
  handle?: string;
  src?: string;
  status?: number;
  headers?: Record<string, string>;
};

const config = JSON.parse(readFileSync(join(import.meta.dir, '../../vercel.json'), 'utf8')) as {
  routes: VercelRoute[];
};

const redirectRoutes = config.routes.filter((route) => route.status === 308);

function findRedirect(pathname: string): string | null {
  for (const route of redirectRoutes) {
    if (!route.src || !route.headers?.Location) continue;

    const match = new RegExp(`^${route.src}$`).exec(pathname);
    if (!match) continue;

    return route.headers.Location.replace(/\$(\d+)/g, (_, index: string) => match[Number(index)] ?? '');
  }

  return null;
}

describe('Vercel blog redirects', () => {
  test('redirects only Ghost sitemap paths', () => {
    expect(findRedirect('/sacrifice')).toBe('https://blog.buxx.me/sacrifice/');
    expect(findRedirect('/sacrifice/')).toBe('https://blog.buxx.me/sacrifice/');
    expect(findRedirect('/author/murray')).toBe('https://blog.buxx.me/author/murray/');
    expect(findRedirect('/tag/prose/')).toBe('https://blog.buxx.me/tag/prose/');
  });

  test('does not keep a global fallback redirect', () => {
    expect(findRedirect('/random-missing-page')).toBeNull();
    expect(findRedirect('/api/moods')).toBeNull();
    expect(findRedirect('/mood')).toBeNull();
    expect(findRedirect('/tag/not-in-sitemap')).toBeNull();
  });
});
