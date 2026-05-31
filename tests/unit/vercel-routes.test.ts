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

describe('Vercel redirects', () => {
  test('does not expose Ghost CMS routes', () => {
    expect(redirectRoutes).toHaveLength(0);
    expect(findRedirect('/sacrifice')).toBeNull();
    expect(findRedirect('/sacrifice/')).toBeNull();
    expect(findRedirect('/author/murray')).toBeNull();
    expect(findRedirect('/tag/prose/')).toBeNull();
  });

  test('does not keep a global fallback redirect', () => {
    expect(findRedirect('/random-missing-page')).toBeNull();
    expect(findRedirect('/api/moods')).toBeNull();
    expect(findRedirect('/mood')).toBeNull();
    expect(findRedirect('/tag/not-in-sitemap')).toBeNull();
  });
});
