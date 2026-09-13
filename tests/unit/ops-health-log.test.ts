import { describe, expect, test } from 'bun:test';
import {
  extractOpsHealthEvidence,
  sanitizeOpsHealthLog,
} from '../../.github/scripts/sanitize-ops-health-log.mjs';

describe('Ops Health log sanitizer', () => {
  test('removes ANSI escapes and known credential shapes', () => {
    const input = [
      '\u001b[31mfailed\u001b[0m',
      'https://api.telegram.org/bot123456:secret_token/getWebhookInfo',
      'Authorization: Bearer secret-value',
      'TELEGRAM_BOT_TOKEN=another-secret',
      'Cookie: session=private-value',
      'https://example.com/probe?token=query-secret&safe=1',
    ].join('\r\n');

    expect(sanitizeOpsHealthLog(input)).toBe([
      'failed',
      'https://api.telegram.org/bot***/getWebhookInfo',
      'Authorization: ***',
      'TELEGRAM_BOT_TOKEN=***',
      'Cookie: ***',
      'https://example.com/probe?token=***&safe=1',
    ].join('\n'));
  });

  test('keeps the end of oversized logs where failures are reported', () => {
    const sanitized = sanitizeOpsHealthLog(`${'a'.repeat(35_000)}\nfinal failure`);

    expect(sanitized).toStartWith('[Earlier output omitted; showing the last 10000 characters.]');
    expect(sanitized).toEndWith('final failure');
    expect(sanitized.length).toBeLessThan(11_000);
  });

  test('extracts stable evidence from Bun test failures', () => {
    const first = [
      '2026-07-15T11:49:31.316Z error: expect(received).toBeGreaterThan(expected)',
      'Expected: > 0',
      'Received: 0',
      '(fail) hd image health > latest mood image URLs are readable [621.00ms]',
      'error: script "test:ops" exited with code 1',
    ].join('\n');
    const second = first
      .replace('2026-07-15T11:49:31.316Z', '2026-07-15T12:51:10.000Z')
      .replace('621.00ms', '988.42ms');

    const firstEvidence = extractOpsHealthEvidence(first, 'failing');
    const secondEvidence = extractOpsHealthEvidence(second, 'failing');

    expect(firstEvidence.failingTests).toEqual([
      'hd image health > latest mood image URLs are readable',
    ]);
    expect(firstEvidence.errors).toContain('Expected: > 0');
    expect(firstEvidence.errors).toContain('Received: 0');
    expect(firstEvidence.fingerprint).toBe(secondEvidence.fingerprint);
  });

  test('uses infrastructure errors when no test case failed', () => {
    const evidence = extractOpsHealthEvidence([
      'Error: Unable to resolve action actions/checkout@v6',
      'The hosted runner lost communication with the server.',
    ].join('\n'), 'infrastructure_failure');

    expect(evidence.failingTests).toEqual([]);
    expect(evidence.errors).toEqual([
      'Error: Unable to resolve action actions/checkout@v6',
      'The hosted runner lost communication with the server.',
    ]);
    expect(evidence.fingerprint).toHaveLength(64);
  });

  test('keeps primary and confirmation failures as structured evidence', () => {
    const testName = 'legacy blog host redirects > every published Ghost post redirects once';
    const input = [
      '2026-09-13T01:02:03Z ##[group]Run bun run test:ops',
      '2026-09-13T01:02:03Z bun test v1.4.0 (34cbb9a40)',
      '2026-09-13T01:02:09Z TypeError: The socket connection was closed unexpectedly.',
      '2026-09-13T01:02:09Z path: "https://buxx.me/blog/email-philosophy",',
      '2026-09-13T01:02:09Z code: "ECONNRESET"',
      `2026-09-13T01:02:09Z (fail) ${testName} [1036.77ms]`,
      '2026-09-13T01:03:03Z ##[group]Run bun run test:ops',
      '2026-09-13T01:03:03Z bun test v1.4.0 (34cbb9a40)',
      '2026-09-13T01:03:07Z TypeError: The socket connection was closed unexpectedly.',
      '2026-09-13T01:03:07Z path: "https://buxx.me/blog/about",',
      '2026-09-13T01:03:07Z code: "ECONNRESET"',
      `2026-09-13T01:03:07Z (fail) ${testName} [827.58ms]`,
      '2026-09-13T01:03:14Z PRIMARY_OUTCOME: failure',
      '2026-09-13T01:03:14Z CONFIRM_OUTCOME: failure',
    ].join('\n');

    const evidence = extractOpsHealthEvidence(input, 'failing');

    expect(evidence.runtime).toEqual({ bunVersion: '1.4.0' });
    expect(evidence.outcomes).toEqual({ primary: 'failure', confirmation: 'failure' });
    expect(evidence.failureOccurrences).toMatchObject([
      {
        phase: 'primary',
        code: 'ECONNRESET',
        target: 'https://buxx.me/blog/email-philosophy',
      },
      {
        phase: 'confirmation',
        code: 'ECONNRESET',
        target: 'https://buxx.me/blog/about',
      },
    ]);
    expect(evidence.errors).toContain('code: ECONNRESET');
    expect(evidence.log).toContain('## primary:');
    expect(evidence.log).toContain('## confirmation:');
    expect(evidence.log).toContain('https://buxx.me/blog/email-philosophy');
    expect(evidence.log).toContain('https://buxx.me/blog/about');
  });

  test('does not fingerprint transient target URLs', () => {
    const createLog = (target: string) => [
      '##[group]Run bun run test:ops',
      'TypeError: The socket connection was closed unexpectedly.',
      `path: "${target}",`,
      'code: "ECONNRESET"',
      '(fail) legacy redirect health',
    ].join('\n');

    const first = extractOpsHealthEvidence(createLog('https://buxx.me/blog/first'), 'failing');
    const second = extractOpsHealthEvidence(createLog('https://buxx.me/blog/second'), 'failing');

    expect(first.fingerprint).toBe(second.fingerprint);
  });
});
