import { describe, expect, test } from 'bun:test';

import { parsePostLocaleTag } from '@bunizao/contracts/content';

describe('parsePostLocaleTag', () => {
  test('parses a bare locale tag', () => {
    expect(parsePostLocaleTag('#en')).toEqual({ locale: 'en' });
  });

  test('parses a translation tag from its name', () => {
    expect(parsePostLocaleTag('#en:lun-chenmo')).toEqual({
      locale: 'en',
      canonicalSlug: 'lun-chenmo',
    });
  });

  test('normalizes BCP 47 tags and canonical slugs', () => {
    expect(parsePostLocaleTag('  #ZH-Hant:LUN-CHENMO  ')).toEqual({
      locale: 'zh-hant',
      canonicalSlug: 'lun-chenmo',
    });
  });

  test('does not parse Ghost tag slugs', () => {
    expect(parsePostLocaleTag('hash-en-lun-chenmo')).toBeNull();
  });

  test('rejects an empty or unsafe canonical slug', () => {
    expect(parsePostLocaleTag('#en:')).toBeNull();
    expect(parsePostLocaleTag('#en:../lun-chenmo')).toBeNull();
    expect(parsePostLocaleTag('#en:lun chenmo')).toBeNull();
  });

  test('rejects malformed locale tags', () => {
    expect(parsePostLocaleTag('#e:lun-chenmo')).toBeNull();
    expect(parsePostLocaleTag('#en_:lun-chenmo')).toBeNull();
  });
});
