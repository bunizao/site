import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type RedirectRule = {
  source: string;
  target: string;
  status: number;
};

const redirectsFile = readFileSync(join(import.meta.dir, '../../public/_redirects'), 'utf8');
const rules = redirectsFile
  .split('\n')
  .map((line) => line.replace(/\s+#.*$/, '').trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'))
  .map((line): RedirectRule => {
    const [source, target, status = '302'] = line.split(/\s+/);
    return { source, target, status: Number(status) };
  });

function findRedirect(pathname: string): RedirectRule | null {
  return rules.find((rule) => rule.source === pathname) ?? null;
}

describe('Cloudflare blog redirects', () => {
  test('redirects only Ghost sitemap paths', () => {
    expect(findRedirect('/sacrifice')).toEqual({
      source: '/sacrifice',
      target: 'https://blog.buxx.me/sacrifice/',
      status: 308,
    });
    expect(findRedirect('/sacrifice/')).toMatchObject({
      target: 'https://blog.buxx.me/sacrifice/',
      status: 308,
    });
    expect(findRedirect('/author/murray')).toMatchObject({
      target: 'https://blog.buxx.me/author/murray/',
      status: 308,
    });
    expect(findRedirect('/tag/prose/')).toMatchObject({
      target: 'https://blog.buxx.me/tag/prose/',
      status: 308,
    });
  });

  test('does not keep a global fallback redirect', () => {
    expect(findRedirect('/random-missing-page')).toBeNull();
    expect(findRedirect('/api/moods')).toBeNull();
    expect(findRedirect('/mood')).toBeNull();
    expect(findRedirect('/tag/not-in-sitemap')).toBeNull();
  });

  test('keeps redirects in Cloudflare static asset format', () => {
    expect(rules).toHaveLength(48);
    expect(rules.every((rule) => rule.source.startsWith('/'))).toBe(true);
    expect(rules.every((rule) => rule.target.startsWith('https://blog.buxx.me/'))).toBe(true);
    expect(rules.every((rule) => rule.status === 308)).toBe(true);
  });
});
