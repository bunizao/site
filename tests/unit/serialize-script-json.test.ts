import { describe, expect, test } from 'bun:test';
import { serializeScriptJson } from '../../src/lib/serialize-script-json';

describe('serializeScriptJson', () => {
  test('round-trips a normal nested object through JSON.parse', () => {
    const value = {
      posts: [{ id: '1', previewText: 'hello world', tags: ['a', 'b'] }],
      channel: { title: 'Channel', description: 'desc' },
      anchorId: undefined,
    };
    const serialized = serializeScriptJson(value);
    expect(JSON.parse(serialized)).toEqual(JSON.parse(JSON.stringify(value)));
  });

  test('contains no literal "<" for a script-closing marker', () => {
    const value = { previewText: '</script><script>alert(1)</script>' };
    const serialized = serializeScriptJson(value);
    expect(serialized.includes('<')).toBe(false);
    expect(JSON.parse(serialized)).toEqual(value);
  });

  test('escapes mixed-case script-closing sequences', () => {
    const value = { previewText: '</SeC' + 'RiPt>' };
    const serialized = serializeScriptJson(value);
    expect(serialized.toLowerCase().includes('</script')).toBe(false);
    expect(JSON.parse(serialized)).toEqual(value);
  });

  test('escapes HTML comment markers and angle brackets', () => {
    const value = { previewText: '<!-- comment --> <div>text</div>' };
    const serialized = serializeScriptJson(value);
    expect(serialized.includes('<')).toBe(false);
    expect(JSON.parse(serialized)).toEqual(value);
  });

  test('round-trips quotes, ampersands, and non-ASCII text exactly', () => {
    const value = {
      previewText: 'He said "hi" & <bye> — 你好，世界 😀 café',
    };
    const serialized = serializeScriptJson(value);
    expect(serialized.includes('<')).toBe(false);
    expect(JSON.parse(serialized)).toEqual(value);
  });

  test('round-trips an empty array and empty object', () => {
    expect(JSON.parse(serializeScriptJson([]))).toEqual([]);
    expect(JSON.parse(serializeScriptJson({}))).toEqual({});
  });
});
