import { describe, expect, test } from 'bun:test';
import { sanitizeOpsHealthLog } from '../../.github/scripts/sanitize-ops-health-log.mjs';

describe('Ops Health log sanitizer', () => {
  test('removes ANSI escapes and known credential shapes', () => {
    const input = [
      '\u001b[31mfailed\u001b[0m',
      'https://api.telegram.org/bot123456:secret_token/getWebhookInfo',
      'Authorization: Bearer secret-value',
      'TELEGRAM_BOT_TOKEN=another-secret',
    ].join('\r\n');

    expect(sanitizeOpsHealthLog(input)).toBe([
      'failed',
      'https://api.telegram.org/bot***/getWebhookInfo',
      'Authorization: ***',
      'TELEGRAM_BOT_TOKEN=***',
    ].join('\n'));
  });

  test('keeps the end of oversized logs where failures are reported', () => {
    const sanitized = sanitizeOpsHealthLog(`${'a'.repeat(35_000)}\nfinal failure`);

    expect(sanitized).toStartWith('[Earlier output omitted; showing the last 10000 characters.]');
    expect(sanitized).toEndWith('final failure');
    expect(sanitized.length).toBeLessThan(11_000);
  });
});
