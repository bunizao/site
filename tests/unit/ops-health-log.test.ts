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
});
