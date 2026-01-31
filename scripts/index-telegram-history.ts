#!/usr/bin/env npx tsx
/**
 * Telegram History Indexer
 *
 * Indexes historical Telegram channel messages by extracting photo file_ids
 * and storing them in Cloudflare KV for the HD image proxy.
 *
 * Usage:
 *   npx tsx scripts/index-telegram-history.ts
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN     - Bot API token from @BotFather
 *   TELEGRAM_CHANNEL_ID    - Channel ID (format: -100xxxxxxxxxx)
 *   CLOUDFLARE_ACCOUNT_ID  - Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN   - Cloudflare API token with KV write access
 *   CLOUDFLARE_KV_NAMESPACE_ID - KV namespace ID for MOOD_IMAGES
 *
 * Optional:
 *   START_MESSAGE_ID       - Start from this message ID (for resuming)
 *   END_MESSAGE_ID         - Stop at this message ID
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;

// Optional: A private group/channel to forward messages to (instead of the original channel)
// This avoids spamming the public channel. Create a private group, add the bot, and use its ID.
const TEMP_CHAT_ID = process.env.TELEGRAM_TEMP_CHAT_ID || CHANNEL_ID;

const START_MESSAGE_ID = process.env.START_MESSAGE_ID ? parseInt(process.env.START_MESSAGE_ID, 10) : 1;
const END_MESSAGE_ID = process.env.END_MESSAGE_ID ? parseInt(process.env.END_MESSAGE_ID, 10) : undefined;

// Rate limiting: Telegram allows 30 requests per second for bots
const RATE_LIMIT_DELAY_MS = 100; // Increased to avoid rate limits
const BATCH_SIZE = 10;

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  photo?: TelegramPhotoSize[];
  media_group_id?: string;
  date: number;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Write a key-value pair to Cloudflare KV
 */
async function writeToKV(key: string, value: string): Promise<boolean> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: value,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`KV write failed for ${key}:`, response.status, error);
    return false;
  }

  return true;
}

/**
 * Bulk write key-value pairs to Cloudflare KV
 */
async function bulkWriteToKV(entries: Array<{ key: string; value: string }>): Promise<number> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/bulk`;

  const body = entries.map(({ key, value }) => ({
    key,
    value,
  }));

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('KV bulk write failed:', response.status, error);
    return 0;
  }

  return entries.length;
}

/**
 * Forward a message to get its file_id (workaround for reading channel history)
 * This copies the message to the bot's saved messages and retrieves file info
 */
async function getMessageWithPhoto(messageId: number): Promise<TelegramMessage | null> {
  // Use copyMessage to a chat we control, then delete it
  // Or use forwardMessage if we have a private chat with the bot

  // Alternative: Use getUpdates if messages are recent
  // For older messages, we need to use copyMessage trick

  // For now, try to use the channel's public embed to extract message info
  // This is a simpler approach that doesn't require forwarding

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHANNEL_ID, // Copy back to same channel (will fail but gives us info)
      from_chat_id: CHANNEL_ID,
      message_id: messageId,
    }),
  });

  // This will fail, but we can try another approach
  const data: TelegramResponse<{ message_id: number }> = await response.json();

  if (!data.ok) {
    // Expected - we need a different approach
    return null;
  }

  return null;
}

/**
 * Get channel messages using getHistory (requires user bot or special permissions)
 * For regular bots, we need to use the webhook approach for new messages
 * and the public embed scraping for historical messages
 */
async function scrapeChannelHistory(): Promise<void> {
  console.log('Starting channel history scrape...');
  console.log(`Channel: ${CHANNEL_ID}`);
  console.log(`Start message: ${START_MESSAGE_ID}`);
  console.log(`End message: ${END_MESSAGE_ID ?? 'latest'}`);

  // For bots, we can't directly access channel history
  // Options:
  // 1. Use Telegram's public embed (t.me/s/channel) - limited info
  // 2. Use a userbot library (mtproto) - more complex
  // 3. Forward messages one by one - slow but works

  // Let's try the forwardMessage approach
  const entries: Array<{ key: string; value: string }> = [];
  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  // Create a temporary private chat by sending a message to ourselves
  // First, get the bot's own chat ID
  const meResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
  const meData: TelegramResponse<{ id: number; username: string }> = await meResponse.json();

  if (!meData.ok || !meData.result) {
    console.error('Failed to get bot info:', meData.description);
    return;
  }

  console.log(`Bot: @${meData.result.username} (${meData.result.id})`);

  // We need a chat where we can forward messages
  // The bot can't message itself, so we need an alternative approach

  // Alternative: Use getChat to check if we have access
  const chatResponse = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${CHANNEL_ID}`
  );
  const chatData: TelegramResponse<{ id: number; title: string }> = await chatResponse.json();

  if (!chatData.ok) {
    console.error('Cannot access channel:', chatData.description);
    console.log('\nMake sure:');
    console.log('1. The bot is added as an admin to the channel');
    console.log('2. The TELEGRAM_CHANNEL_ID is correct (format: -100xxxxxxxxxx)');
    return;
  }

  console.log(`Channel: ${chatData.result?.title} (${chatData.result?.id})`);

  // For indexing historical messages, we need to use a workaround
  // The best approach is to set up the webhook first, then manually
  // trigger a re-send of old messages or use the public embed scraper

  console.log('\n--- Historical Indexing Approach ---');
  console.log('Telegram Bot API does not provide direct access to channel history.');
  console.log('To index historical messages, you have several options:\n');
  console.log('Option 1: Use the webhook for new messages (already implemented)');
  console.log('  - New messages will be automatically indexed via /api/telegram-webhook\n');
  console.log('Option 2: Re-post old images');
  console.log('  - Forward old posts to the channel to trigger webhook indexing\n');
  console.log('Option 3: Use a Telegram userbot library');
  console.log('  - Libraries like gramjs or telethon can access full history');
  console.log('  - Requires a user account, not just a bot\n');
  console.log('Option 4: Parse the public embed (t.me/s/channel)');
  console.log('  - Limited: only provides thumbnail URLs, not file_ids');
  console.log('  - This is what the current code does as fallback\n');

  // Let's implement a simple probe to check a few recent message IDs
  console.log('--- Probing Recent Messages ---\n');

  // Try to get messages via getChatHistory (won't work for regular bots)
  // But let's check if the bot can access any message info
  const testMessageId = START_MESSAGE_ID;

  // Try to pin/unpin to verify message exists (non-destructive check)
  const checkUrl = `https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`;
  const checkResponse = await fetch(checkUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TEMP_CHAT_ID,
      from_chat_id: CHANNEL_ID,
      message_id: testMessageId,
      disable_notification: true,
    }),
  });

  const checkData: TelegramResponse<TelegramMessage> = await checkResponse.json();

  if (checkData.ok && checkData.result) {
    console.log(`Message ${testMessageId} forwarded successfully!`);
    console.log('The forwardMessage approach works. Processing...\n');

    // Delete the forwarded message
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TEMP_CHAT_ID,
        message_id: checkData.result.message_id,
      }),
    });

    if (checkData.result.photo) {
      const largest = checkData.result.photo[checkData.result.photo.length - 1];
      console.log(`Found photo: ${largest.file_id.substring(0, 30)}...`);

      entries.push({
        key: `mood:${testMessageId}:0`,
        value: largest.file_id,
      });
      indexed++;
    }
  } else {
    console.log(`Cannot forward message ${testMessageId}: ${checkData.description}`);
    console.log('\nThe bot may not have permission to forward messages.');
    console.log('Ensure the bot is a channel admin with "Post Messages" permission.\n');
  }

  // If we have entries, write them
  if (entries.length > 0) {
    console.log(`\nWriting ${entries.length} entries to KV...`);
    const written = await bulkWriteToKV(entries);
    console.log(`Successfully wrote ${written} entries.`);
  }

  console.log('\n--- Summary ---');
  console.log(`Indexed: ${indexed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

/**
 * Index messages by iterating through message IDs
 * This is slow but works for any bot with channel access
 */
async function indexByMessageId(startId: number, endId: number): Promise<void> {
  console.log(`\nIndexing messages ${startId} to ${endId}...`);

  const entries: Array<{ key: string; value: string }> = [];
  let indexed = 0;
  let skipped = 0;
  let notFound = 0;

  for (let messageId = startId; messageId <= endId; messageId++) {
    // Forward the message to temp chat (not the original channel)
    const forwardResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TEMP_CHAT_ID,
          from_chat_id: CHANNEL_ID,
          message_id: messageId,
          disable_notification: true,
        }),
      }
    );

    const forwardData: TelegramResponse<TelegramMessage> = await forwardResponse.json();

    if (!forwardData.ok) {
      if (forwardData.error_code === 400) {
        // Message not found or deleted
        notFound++;
      } else if (forwardData.error_code === 429) {
        // Rate limited - wait and retry
        const retryAfter = (forwardData as any).parameters?.retry_after || 60;
        console.log(`Rate limited. Waiting ${retryAfter}s before retrying message ${messageId}...`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 + 1000));
        messageId--; // Retry this message
      } else {
        console.error(`Error forwarding ${messageId}: ${forwardData.description}`);
      }
      continue;
    }

    const forwardedMessage = forwardData.result!;

    // Delete the forwarded message immediately
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TEMP_CHAT_ID,
        message_id: forwardedMessage.message_id,
      }),
    });

    // Check if message has photos
    if (forwardedMessage.photo && forwardedMessage.photo.length > 0) {
      const largest = forwardedMessage.photo[forwardedMessage.photo.length - 1];
      entries.push({
        key: `mood:${messageId}:0`,
        value: largest.file_id,
      });
      indexed++;
      console.log(`✓ Message ${messageId}: photo indexed`);
    } else {
      skipped++;
    }

    // Batch write to KV
    if (entries.length >= BATCH_SIZE) {
      await bulkWriteToKV(entries);
      entries.length = 0;
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));

    // Progress
    if ((messageId - startId) % 100 === 0) {
      console.log(`Progress: ${messageId - startId}/${endId - startId} messages`);
    }
  }

  // Write remaining entries
  if (entries.length > 0) {
    await bulkWriteToKV(entries);
  }

  console.log('\n--- Summary ---');
  console.log(`Indexed: ${indexed} photos`);
  console.log(`Skipped: ${skipped} non-photo messages`);
  console.log(`Not found: ${notFound} deleted/missing messages`);
}

// Main entry point
async function main(): Promise<void> {
  console.log('=== Telegram History Indexer ===\n');

  // Validate required environment variables
  const missing: string[] = [];
  if (!BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!CHANNEL_ID) missing.push('TELEGRAM_CHANNEL_ID');
  if (!CF_ACCOUNT_ID) missing.push('CLOUDFLARE_ACCOUNT_ID');
  if (!CF_API_TOKEN) missing.push('CLOUDFLARE_API_TOKEN');
  if (!KV_NAMESPACE_ID) missing.push('CLOUDFLARE_KV_NAMESPACE_ID');

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((name) => console.error(`  - ${name}`));
    console.log('\nUsage:');
    console.log('  TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHANNEL_ID=-100xxx ... npx tsx scripts/index-telegram-history.ts');
    process.exit(1);
  }

  await scrapeChannelHistory();

  // If END_MESSAGE_ID is provided, run the full indexer
  if (END_MESSAGE_ID && END_MESSAGE_ID > START_MESSAGE_ID) {
    await indexByMessageId(START_MESSAGE_ID, END_MESSAGE_ID);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
