import { describe, expect, test } from 'bun:test';

import {
  telegramShareUrl,
  withInstantViewRhash,
} from '@/features/posts/instant-view';

const RHASH = '9a1b2c3d4e5f60';

describe('withInstantViewRhash', () => {
  test('appends the template hash to an absolute URL', () => {
    expect(withInstantViewRhash('https://buxx.me/blog/tides-write-back', RHASH))
      .toBe(`https://buxx.me/blog/tides-write-back?rhash=${RHASH}`);
  });

  test('keeps the query a post already carries', () => {
    expect(withInstantViewRhash('https://buxx.me/blog/tides-write-back?lang=en', RHASH))
      .toBe(`https://buxx.me/blog/tides-write-back?lang=en&rhash=${RHASH}`);
  });

  test('replaces a hash that is already on the URL', () => {
    expect(withInstantViewRhash('https://buxx.me/blog/tides-write-back?rhash=stale', RHASH))
      .toBe(`https://buxx.me/blog/tides-write-back?rhash=${RHASH}`);
  });

  // No template published yet is the state this ships in, and it has to leave
  // every link exactly as it found it.
  test('leaves the URL alone when no hash is configured', () => {
    expect(withInstantViewRhash('https://buxx.me/blog/tides-write-back', ''))
      .toBe('https://buxx.me/blog/tides-write-back');
    expect(withInstantViewRhash('https://buxx.me/blog/tides-write-back', '   '))
      .toBe('https://buxx.me/blog/tides-write-back');
  });

  test('drops a stale hash when the site no longer configures one', () => {
    expect(withInstantViewRhash('https://buxx.me/blog/tides-write-back?rhash=stale', ''))
      .toBe('https://buxx.me/blog/tides-write-back');
  });

  test('passes a relative URL through rather than guessing an origin', () => {
    expect(withInstantViewRhash('/blog/tides-write-back', RHASH)).toBe('/blog/tides-write-back');
  });
});

describe('telegramShareUrl', () => {
  test('points Telegram at the post and carries the title as the message', () => {
    const share = new URL(telegramShareUrl({
      url: 'https://buxx.me/blog/tides-write-back',
      title: '潮汐回信',
      rhash: RHASH,
    }));

    expect(share.origin + share.pathname).toBe('https://t.me/share/url');
    expect(share.searchParams.get('url'))
      .toBe(`https://buxx.me/blog/tides-write-back?rhash=${RHASH}`);
    expect(share.searchParams.get('text')).toBe('潮汐回信');
  });

  test('omits the message when there is no title to send', () => {
    const share = new URL(telegramShareUrl({
      url: 'https://buxx.me/blog/tides-write-back',
      title: '   ',
    }));

    expect(share.searchParams.has('text')).toBe(false);
    expect(share.searchParams.get('url')).toBe('https://buxx.me/blog/tides-write-back');
  });
});
