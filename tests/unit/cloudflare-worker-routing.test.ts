import { describe, expect, test } from 'bun:test';
import { isImageWorkerRequest } from '../../src/worker-routing';

describe('Cloudflare Worker routing', () => {
  test('routes only the image custom domain to the image worker', () => {
    expect(isImageWorkerRequest(new Request('https://image.buxx.me/channel/avatar'))).toBe(true);
    expect(isImageWorkerRequest(new Request('https://buxx.me/channel/avatar'))).toBe(false);
    expect(isImageWorkerRequest(new Request('https://www.buxx.me/channel/avatar'))).toBe(false);
    expect(isImageWorkerRequest(new Request('https://cf-migration.buxx.me/channel/avatar'))).toBe(false);
  });

  test('uses the host header when the request URL host is local', () => {
    const request = new Request('http://127.0.0.1:8787/channel/avatar', {
      headers: { host: 'image.buxx.me' },
    });

    expect(isImageWorkerRequest(request)).toBe(true);
  });

  test('does not route non-local hosts from a spoofed host header', () => {
    const request = new Request('https://buxx.me/channel/avatar', {
      headers: { host: 'image.buxx.me' },
    });

    expect(isImageWorkerRequest(request)).toBe(false);
  });
});
