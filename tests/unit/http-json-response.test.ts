import { describe, expect, test } from 'bun:test';

import {
  json,
  jsonBadRequest,
  jsonError,
  jsonOk,
  jsonTooManyRequests,
} from '../../src/lib/http/json-response';

describe('json response helpers', () => {
  test('creates a success response with json content type', async () => {
    const response = jsonOk({ ok: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.json()).toEqual({ ok: true });
  });

  test('creates a generic json response with the provided status', async () => {
    const response = json(202, { queued: true }, { 'X-Test': '1' });

    expect(response.status).toBe(202);
    expect(response.headers.get('X-Test')).toBe('1');
    expect(await response.json()).toEqual({ queued: true });
  });

  test('includes extra error fields when requested', async () => {
    const response = jsonError(
      503,
      'Turnstile verification unavailable',
      { 'X-Test': '1' },
      { code: 'verify_unavailable' }
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('X-Test')).toBe('1');
    expect(await response.json()).toEqual({
      error: 'Turnstile verification unavailable',
      code: 'verify_unavailable',
    });
  });

  test('provides convenience helpers for bad request and rate-limit responses', async () => {
    const badRequest = jsonBadRequest('Missing postId parameter');
    const tooManyRequests = jsonTooManyRequests({ 'Retry-After': '60' });

    expect(badRequest.status).toBe(400);
    expect(await badRequest.json()).toEqual({ error: 'Missing postId parameter' });

    expect(tooManyRequests.status).toBe(429);
    expect(tooManyRequests.headers.get('Retry-After')).toBe('60');
    expect(await tooManyRequests.json()).toEqual({ error: 'Too Many Requests' });
  });
});
