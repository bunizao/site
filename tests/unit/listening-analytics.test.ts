import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  ListeningPlaybackAnalytics,
  inferListeningSurface,
} from '@/lib/listening/analytics';
import type { ListeningAnalyticsEventInput } from '@bunizao/contracts/analytics';

describe('listening analytics', () => {
  test('separates play intent from successful playback and accumulates heard time', () => {
    let currentNow = 1_000;
    const events: ListeningAnalyticsEventInput[] = [];
    const tracker = new ListeningPlaybackAnalytics({
      metadata: () => ({
        trackId: '2038979910',
        trackTitle: 'Example track',
        trackArtist: 'Example artist',
        pagePath: '/blog/example/',
        surface: 'blog',
      }),
      createId: () => '11111111-1111-4111-8111-111111111111',
      now: () => currentNow,
      send: (event) => events.push(event),
      visitorId: 'visitor-11111',
      sessionId: 'session-11111',
    });

    tracker.requestPlay();
    tracker.observe({ owned: true, isPlaying: true, currentTime: 0, duration: 90 });
    currentNow = 11_000;
    tracker.observe({ owned: true, isPlaying: false, currentTime: 10, duration: 90 });

    expect(events.map((event) => event.action)).toEqual(['play_request', 'play', 'pause']);
    expect(events[0]).toMatchObject({ requestCount: 1, playCount: 0, listenedMs: 0 });
    expect(events[2]).toMatchObject({
      requestCount: 1,
      playCount: 1,
      pauseCount: 1,
      listenedMs: 10_000,
      mediaTimeMs: 10_000,
      durationMs: 90_000,
    });

    tracker.flush();
    expect(events.map((event) => event.action)).toEqual(['play_request', 'play', 'pause']);
  });

  test('checkpoints long playback, records seeks once, and recognizes completion', () => {
    let currentNow = 0;
    let nextId = 1;
    const events: ListeningAnalyticsEventInput[] = [];
    const tracker = new ListeningPlaybackAnalytics({
      metadata: () => ({
        trackId: null,
        trackTitle: 'Preview track',
        trackArtist: null,
        pagePath: '/',
        surface: 'home',
      }),
      createId: () => `22222222-2222-4222-8222-${String(nextId++).padStart(12, '0')}`,
      now: () => currentNow,
      send: (event) => events.push(event),
      visitorId: 'visitor-22222',
      sessionId: 'session-22222',
      checkpointMs: 15_000,
    });

    tracker.requestPlay();
    tracker.observe({ owned: true, isPlaying: true, currentTime: 0, duration: 30 });
    currentNow = 16_000;
    tracker.observe({ owned: true, isPlaying: true, currentTime: 16, duration: 30 });
    tracker.recordSeek();
    currentNow = 30_000;
    tracker.observe({ owned: true, isPlaying: true, currentTime: 29.8, duration: 30 });
    tracker.observe({ owned: true, isPlaying: false, currentTime: 0, duration: 0 });

    expect(events.map((event) => event.action)).toEqual([
      'play_request',
      'play',
      'progress',
      'seek',
      'complete',
    ]);
    expect(events.at(-1)).toMatchObject({
      seekCount: 1,
      completed: true,
      mediaTimeMs: 29_800,
      durationMs: 30_000,
      listenedMs: 30_000,
    });

    tracker.requestPlay();
    expect(events.at(-1)?.playbackId).not.toBe(events[0]?.playbackId);
  });

  test('classifies the Listening surface from the page path', () => {
    expect(inferListeningSurface('/')).toBe('home');
    expect(inferListeningSurface('/blog/example/')).toBe('blog');
    expect(inferListeningSurface('/mood/123')).toBe('mood');
    expect(inferListeningSurface('/components/listening')).toBe('components');
    expect(inferListeningSurface('/projects')).toBe('other');
  });

  test('wires playback requests, player snapshots, and seeks into the shared controller', () => {
    const source = readFileSync(new URL('../../src/lib/listening/controller.ts', import.meta.url), 'utf8');

    expect(source).toContain('createBrowserListeningAnalytics');
    expect(source).toContain('listeningAnalytics?.requestPlay()');
    expect(source).toContain('listeningAnalytics?.observe({');
    expect(source).toContain('listeningAnalytics?.recordSeek()');
  });

  test('wires blog prose music cards into the shared playback tracker', () => {
    const source = readFileSync(new URL('../../src/features/posts/client/prose.ts', import.meta.url), 'utf8');

    expect(source).toContain('createBrowserListeningAnalytics');
    expect(source).toContain('cardEl.dataset.trackTitle');
    expect(source).toContain('listeningAnalytics?.requestPlay()');
    expect(source).toContain('listeningAnalytics?.observe({');
    expect(source).toContain('listeningAnalytics?.recordSeek()');
  });

  test('emits the final media position before the preview player clears its source', () => {
    const source = readFileSync(new URL('../../src/lib/musickit/player.ts', import.meta.url), 'utf8');
    const endedHandler = source.match(/addEventListener\('ended', \(\) => \{(?<body>[\s\S]*?)\n\s*\}\);/u);
    const body = endedHandler?.groups?.body ?? '';

    expect(body).toContain('this.emit()');
    expect(body.indexOf('this.emit()')).toBeLessThan(body.indexOf('this.source = null'));
  });
});
