import { describe, expect, test } from 'bun:test';
import {
  appendMoodApiModeQueryValue,
  readMoodApiModeQueryValue,
} from '../../src/features/mood/shared/api-mode';
import {
  isMoodApiV2DefaultEnabled,
  resolveMoodApiV2Mode,
} from '../../src/features/mood/server/api-mode';

describe('mood API mode', () => {
  test('reads explicit query values with false aliases', () => {
    expect(readMoodApiModeQueryValue(new URL('https://buxx.me/mood'))).toBeNull();
    expect(readMoodApiModeQueryValue(new URL('https://buxx.me/mood?api-v2=true'))).toBe('true');
    expect(readMoodApiModeQueryValue(new URL('https://buxx.me/mood?api-v2=1'))).toBe('true');
    expect(readMoodApiModeQueryValue(new URL('https://buxx.me/mood?api-v2=false'))).toBe('false');
    expect(readMoodApiModeQueryValue(new URL('https://buxx.me/mood?api-v2=off'))).toBe('false');
  });

  test('uses runtime default only when the query is absent', () => {
    const locals = { env: { MOOD_API_V2_DEFAULT: 'true' } };

    expect(isMoodApiV2DefaultEnabled(locals)).toBe(true);
    expect(resolveMoodApiV2Mode(new URL('https://buxx.me/mood'), locals)).toBe(true);
    expect(resolveMoodApiV2Mode(new URL('https://buxx.me/mood?api-v2=false'), locals)).toBe(false);
    expect(resolveMoodApiV2Mode(new URL('https://buxx.me/mood?api-v2=true'), { env: {} })).toBe(true);
  });

  test('appends only explicit query mode values', () => {
    const query = new URLSearchParams({ before: '44' });

    appendMoodApiModeQueryValue(query, null);
    expect(query.toString()).toBe('before=44');

    appendMoodApiModeQueryValue(query, 'false');
    expect(query.toString()).toBe('before=44&api-v2=false');
  });
});
