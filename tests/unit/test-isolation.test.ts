import { describe, expect, test } from 'bun:test';
import { UnmockedNetworkError } from '../setup/isolate';

describe('test isolation preload', () => {
  test('blocks requests to external hosts', async () => {
    await expect(fetch('https://api.telegram.org/botX/sendMessage')).rejects.toBeInstanceOf(UnmockedNetworkError);
  });

  test('strips credentials inherited from the shell', () => {
    const leaked = ['TELEGRAM_OPS_BOT_TOKEN', 'TELEGRAM_OPS_ALLOWED_USER_IDS', 'TELEGRAM_BOT_TOKEN', 'RESEND_API_KEY']
      .filter((name) => process.env[name] !== undefined);
    expect(leaked).toEqual([]);
  });
});
