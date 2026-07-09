import { describe, expect, test } from 'bun:test';
import { redactCvDocument } from '@bunizao/contracts';
import { getCv } from '../../src/features/cv/server/api-client';
import { SAMPLE_CV } from '../../src/features/cv/data/sample';

describe('CV API client', () => {
  test('refetches the real public CV when a full token is rejected', async () => {
    const paths: string[] = [];
    const api = {
      async fetch(input: RequestInfo | URL) {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);

        if (url.searchParams.get('full') === '1') {
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        }

        return Response.json(redactCvDocument(SAMPLE_CV));
      },
    };

    const cv = await getCv({
      request: new Request('https://buxx.me/cv'),
      locals: { env: { API: api } },
    }, { lang: 'en', full: true, key: 'bad-token' });

    expect(cv.full).toBe(false);
    expect(cv.identity.legalName).toBeNull();
    expect(paths).toEqual([
      '/api/cv?lang=en&full=1&key=bad-token',
      '/api/cv?lang=en',
    ]);
  });
});
