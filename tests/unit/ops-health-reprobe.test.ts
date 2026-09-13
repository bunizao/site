import { describe, expect, test } from 'bun:test';

import {
  collectProbeTargets,
  reprobeOpsHealthTargets,
} from '../../.github/scripts/reprobe-ops-health-targets.mjs';

describe('Ops Health target reprobe', () => {
  test('keeps only unique public buxx.me targets without sensitive query parameters', () => {
    const targets = collectProbeTargets({
      failureOccurrences: [
        { target: 'https://buxx.me/blog/about' },
        { target: 'https://buxx.me/blog/about' },
        { target: 'https://api.buxx.me/v2/mood' },
        { target: 'https://blog.buxx.me/ghost/api/content/posts/?key=redacted' },
        { target: 'http://buxx.me/insecure' },
        { target: 'https://example.com/external' },
      ],
    });

    expect(targets).toEqual([
      'https://buxx.me/blog/about',
      'https://api.buxx.me/v2/mood',
    ]);
  });

  test('records independent Node fetch results as comparative evidence', async () => {
    const calls: string[] = [];
    const result = await reprobeOpsHealthTargets({
      failureOccurrences: [
        { target: 'https://buxx.me/blog/about' },
        { target: 'https://buxx.me/blog/email-philosophy' },
      ],
    }, async (target) => {
      calls.push(String(target));
      return new Response('ok', { status: 200 });
    });

    expect(calls).toEqual([
      'https://buxx.me/blog/about',
      'https://buxx.me/blog/email-philosophy',
    ]);
    expect(result).toMatchObject({
      transport: 'node-fetch',
      probes: [
        { target: 'https://buxx.me/blog/about', ok: true, status: 200 },
        { target: 'https://buxx.me/blog/email-philosophy', ok: true, status: 200 },
      ],
    });
  });

  test('records transport failures without aborting later probes', async () => {
    let request = 0;
    const result = await reprobeOpsHealthTargets({
      failureOccurrences: [
        { target: 'https://buxx.me/blog/first' },
        { target: 'https://buxx.me/blog/second' },
      ],
    }, async () => {
      request += 1;
      if (request === 1) {
        const error = new Error('connection reset');
        Object.assign(error, { code: 'ECONNRESET' });
        throw error;
      }
      return new Response('ok', { status: 200 });
    });

    expect(result.probes).toHaveLength(2);
    expect(result.probes[0]).toMatchObject({
      ok: false,
      error: { code: 'ECONNRESET', message: 'connection reset' },
    });
    expect(result.probes[1]).toMatchObject({ ok: true, status: 200 });
  });
});
