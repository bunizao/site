import { describe, expect, test } from 'bun:test';

interface TelegramWebhookInfoResponse {
  ok: boolean;
  result?: {
    url?: string;
    pending_update_count?: number;
    allowed_updates?: string[];
    last_error_message?: string;
  };
}

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getExpectedWebhookUrl(): string {
  const explicitUrl = readEnv('TELEGRAM_EXPECTED_WEBHOOK_URL');
  if (explicitUrl) {
    return explicitUrl;
  }

  const apiUrl = readEnv('API_URL') || 'https://api.buxx.me';
  return `${apiUrl.replace(/\/+$/, '')}/v1/telegram/webhook`;
}

describe('telegram webhook health', () => {
  test('telegram bot points at the expected webhook endpoint', async () => {
    const botToken = readEnv('TELEGRAM_BOT_TOKEN');
    const expectedUrl = getExpectedWebhookUrl();

    if (!botToken) {
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    expect(response.ok).toBe(true);

    const payload = await response.json() as TelegramWebhookInfoResponse;
    expect(payload.ok).toBe(true);
    expect(payload.result?.url ?? '').toBe(expectedUrl);
    expect(Array.isArray(payload.result?.allowed_updates)).toBe(true);
    expect(payload.result?.allowed_updates ?? []).toContain('channel_post');
    expect(payload.result?.pending_update_count ?? 0).toBeGreaterThanOrEqual(0);
  });
});
