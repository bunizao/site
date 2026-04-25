import { describe, expect, test } from 'bun:test';

import { readEnv, readOptionalEnv, readPublicEnv } from '../../src/lib/runtime/env';

describe('runtime env helpers', () => {
  test('prefers process env values over build and runtime values', () => {
    const previousValue = process.env.SITE_URL;
    process.env.SITE_URL = ' https://process.example ';

    const locals = {
      runtime: {
        env: {
          SITE_URL: 'https://runtime.example',
        },
      },
    };

    try {
      const value = readEnv(locals, 'SITE_URL', {
        SITE_URL: 'https://build.example',
      });

      expect(value).toBe('https://process.example');
    } finally {
      if (previousValue === undefined) {
        delete process.env.SITE_URL;
      } else {
        process.env.SITE_URL = previousValue;
      }
    }
  });

  test('prefers build-time values over runtime values', () => {
    const locals = {
      runtime: {
        env: {
          SITE_URL: 'https://runtime.example',
        },
      },
    };

    const value = readEnv(locals, 'SITE_URL', {
      SITE_URL: ' https://build.example ',
    });

    expect(value).toBe('https://build.example');
  });

  test('falls back to runtime env when build env is missing', () => {
    const locals = {
      env: {
        SITE_URL: ' https://edge.example ',
      },
    };

    expect(readEnv(locals, 'SITE_URL', {})).toBe('https://edge.example');
  });

  test('reads public env values with the PUBLIC_ prefix', () => {
    const locals = {
      runtime: {
        env: {
          PUBLIC_HD_IMAGE_URL: 'https://runtime-image.example',
        },
      },
    };

    expect(readPublicEnv(locals, 'HD_IMAGE_URL', {})).toBe('https://runtime-image.example');
  });

  test('returns undefined for missing optional env values', () => {
    expect(readOptionalEnv(undefined, 'MISSING_ENV', {})).toBeUndefined();
    expect(readEnv(undefined, 'MISSING_ENV', {})).toBe('');
  });
});
