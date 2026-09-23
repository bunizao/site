import { describe, expect, test } from 'bun:test';

import { LEGACY_BLOG_REDIRECT_RULES, RESERVED_ROOT_SEGMENTS } from '../../scripts/legacy-blog-redirects';

function targetOf(rule: (typeof LEGACY_BLOG_REDIRECT_RULES)[number]): string {
  const target = rule.action_parameters.from_value.target_url;
  return 'value' in target ? target.value : target.expression;
}

describe('legacy blog host redirect rules', () => {
  test('fit the Free plan quota beside the three unrelated zone rules', () => {
    expect(LEGACY_BLOG_REDIRECT_RULES.length).toBeLessThanOrEqual(7);
  });

  test('only ever match GET and HEAD on the legacy host', () => {
    for (const rule of LEGACY_BLOG_REDIRECT_RULES) {
      expect(rule.expression.startsWith(
        'http.host eq "blog.buxx.me" and http.request.method in {"GET" "HEAD"} and (',
      )).toBe(true);
      expect(rule.expression.length).toBeLessThan(4096);
      expect(rule.action_parameters.from_value.status_code).toBe(301);
    }
  });

  test('land directly on slashless buxx.me URLs', () => {
    for (const rule of LEGACY_BLOG_REDIRECT_RULES) {
      const target = targetOf(rule);
      expect(target).toContain('https://buxx.me/');
      expect(target.endsWith('/')).toBe(false);
      expect(target.endsWith('/")')).toBe(false);
    }
  });

  test('keep every Ghost namespace out of the article rules', () => {
    const article = LEGACY_BLOG_REDIRECT_RULES.filter((rule) => rule.ref.endsWith('trailing_slash'));
    expect(article).toHaveLength(2);
    for (const namespace of ['ghost', 'members', 'p', 'unsubscribe', '.well-known', 'cdn-cgi']) {
      expect(RESERVED_ROOT_SEGMENTS as readonly string[]).toContain(namespace);
    }
    for (const rule of article) {
      for (const segment of RESERVED_ROOT_SEGMENTS) {
        expect(rule.expression).toContain(`"/${segment}`);
      }
      expect(rule.expression).toContain('contains "."');
    }
  });

  test('use only Free plan operators', () => {
    for (const rule of LEGACY_BLOG_REDIRECT_RULES) {
      expect(rule.expression).not.toMatch(/\bmatches\b/);
      expect(targetOf(rule)).not.toContain('regex_replace');
    }
  });
});
