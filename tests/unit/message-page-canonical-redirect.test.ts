import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(import.meta.dir, '../../src/pages/message.astro'),
  'utf8',
);

describe('message page rendering mode', () => {
  // /message is not in wrangler.jsonc's assets.run_worker_first, so a
  // prerendered build would let Cloudflare serve the static file straight
  // from the assets layer -- skipping the Worker entirely, including its
  // www -> apex canonical redirect (src/worker.ts's redirectCanonicalUrl).
  // www.buxx.me/message must stay server-rendered so that redirect still runs.
  test('opts out of prerendering', () => {
    expect(source).toMatch(/export const prerender = false;/);
  });
});
