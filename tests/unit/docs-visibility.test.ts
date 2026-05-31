import { describe, expect, test } from 'bun:test';

import {
  docsPathToEntrySlug,
  getDocsVisibility,
  getDocsVisibilityFromEntry,
  isDocsPath,
} from '../../src/features/docs/server/visibility';

describe('docs visibility', () => {
  test('maps docs paths to nested Starlight slugs', () => {
    expect(isDocsPath('/docs')).toBe(true);
    expect(isDocsPath('/docs/overview/architecture')).toBe(true);
    expect(isDocsPath('/privacy')).toBe(false);

    expect(docsPathToEntrySlug('/docs')).toBe('docs');
    expect(docsPathToEntrySlug('/docs/')).toBe('docs');
    expect(docsPathToEntrySlug('/docs/overview/architecture/')).toBe('docs/overview/architecture');
    expect(docsPathToEntrySlug('/privacy')).toBeNull();
  });

  test('treats only explicitly public docs as public', () => {
    expect(getDocsVisibilityFromEntry({ data: { public: true } })).toBe('public');
    expect(getDocsVisibilityFromEntry({ data: { public: false } })).toBe('protected');
    expect(getDocsVisibilityFromEntry({ data: {} })).toBe('protected');
    expect(getDocsVisibilityFromEntry(null)).toBe('missing');
  });

  test('loads visibility for docs paths', async () => {
    const loadEntry = async (slug: string) => {
      if (slug === 'docs/overview/architecture') return { data: { public: true } };
      if (slug === 'docs/pipeline/email-notify') return { data: {} };
      return null;
    };

    expect(await getDocsVisibility('/docs/overview/architecture', loadEntry)).toBe('public');
    expect(await getDocsVisibility('/docs/pipeline/email-notify', loadEntry)).toBe('protected');
    expect(await getDocsVisibility('/docs/missing-page', loadEntry)).toBe('missing');
  });
});
