// A failed exit send must not look like a successful one to the dedupe
// window: visibilitychange->hidden and pagehide both flush on the same page
// exit, and the second of the pair is the retry for a first send that never
// left the browser, not a duplicate of one that did.

import { describe, expect, test } from 'bun:test';
import { ListeningPlaybackAnalytics } from '@/lib/listening/analytics';
import type { ListeningAnalyticsEventInput } from '@bunizao/contracts/analytics';

function trackerWith(send: (event: ListeningAnalyticsEventInput) => boolean) {
  let currentNow = 0;
  const tracker = new ListeningPlaybackAnalytics({
    metadata: () => ({
      trackId: null,
      trackTitle: 'Exit track',
      trackArtist: null,
      pagePath: '/',
      surface: 'home',
    }),
    createId: () => '55555555-5555-4555-8555-555555555555',
    now: () => currentNow,
    send,
    visitorId: 'visitor-55555',
    sessionId: 'session-55555',
  });
  return { tracker, advance: (ms: number) => { currentNow += ms; } };
}

describe('listening analytics exit-flush retry', () => {
  test('a failed flush leaves the dedupe window open for the very next one', () => {
    const events: ListeningAnalyticsEventInput[] = [];
    let failNextSend = false;
    const { tracker, advance } = trackerWith((event) => {
      if (failNextSend) {
        failNextSend = false;
        return false; // this one never left the browser
      }
      events.push(event);
      return true;
    });

    tracker.requestPlay();
    tracker.observe({ owned: true, isPlaying: true, currentTime: 0, duration: 90 });
    advance(20_000);

    // visibilitychange->hidden: the send fails (sendBeacon declined and the
    // fetch fallback threw synchronously).
    failNextSend = true;
    tracker.flush();
    expect(events.map((event) => event.action)).toEqual(['play_request', 'play']);

    // pagehide, 5ms later, same page exit -- this is the retry, and it must
    // not be swallowed by FLUSH_DEDUPE_MS just because the first attempt
    // happened moments ago.
    advance(5);
    tracker.flush();
    expect(events.map((event) => event.action)).toEqual(['play_request', 'play', 'progress']);
  });

  test('a successful flush still dedupes the very next one', () => {
    const events: ListeningAnalyticsEventInput[] = [];
    const { tracker, advance } = trackerWith((event) => {
      events.push(event);
      return true;
    });

    tracker.requestPlay();
    tracker.observe({ owned: true, isPlaying: true, currentTime: 0, duration: 90 });
    advance(20_000);

    tracker.flush();
    advance(5);
    tracker.flush();

    expect(events.map((event) => event.action)).toEqual(['play_request', 'play', 'progress']);
  });
});
