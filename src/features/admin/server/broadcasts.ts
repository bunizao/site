import { randomBytes } from 'node:crypto';
import { load } from 'cheerio';
import { FONT_DISPLAY } from '@/lib/fonts';
import type { NotifyD1Client } from '@/features/notify/server/d1';
import { getNotifyConfig, getNotifyFromAddress, requireConfigValue } from '@/features/notify/server/env';
import { sendEmailWithResend } from '@/features/notify/server/resend';
import { hashEmail, isValidEmail, normalizeEmail } from '@/features/notify/server/security';
import {
  NOTIFY_CHANNELS,
  type DeliveryMode,
  type NotifyChannel,
  type SubscriberStatus,
} from '@/features/notify/server/types';
import { createAdminD1, type AdminContext } from './subscribers-admin';

export interface BroadcastAudience {
  status: SubscriberStatus | 'active';
  channels: NotifyChannel[];
  deliveryModes?: DeliveryMode[];
}

export interface BroadcastInput {
  subject: string;
  body: string;
  audience: BroadcastAudience;
}

export interface BroadcastRecord {
  id: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  audience: BroadcastAudience;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  createdAt: string;
  sentAt: string | null;
  sentBy: string;
}

export interface BroadcastPreviewResult {
  subject: string;
  html: string;
  text: string;
  recipientCount: number;
}

export interface BroadcastSendResult {
  id: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: BroadcastRecord['status'];
}

interface BroadcastRow {
  id: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  audience_json: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: BroadcastRecord['status'];
  created_at: string;
  sent_at: string | null;
  sent_by: string;
}

interface SubscriberRow {
  email: string;
  email_hash: string;
  status: SubscriberStatus;
  delivery_mode: DeliveryMode | null;
  channels: string | null;
}

const BROADCAST_COLUMNS = `
  id,
  subject,
  body_html,
  body_text,
  audience_json,
  recipient_count,
  sent_count,
  failed_count,
  status,
  created_at,
  sent_at,
  sent_by
`;

function parseAudience(value: string): BroadcastAudience {
  try {
    const parsed = JSON.parse(value);
    return {
      status: parsed.status ?? 'active',
      channels: Array.isArray(parsed.channels) ? parsed.channels : ['mood'],
      deliveryModes: Array.isArray(parsed.deliveryModes) ? parsed.deliveryModes : undefined,
    };
  } catch {
    return { status: 'active', channels: ['mood'] };
  }
}

function mapBroadcastRow(row: BroadcastRow): BroadcastRecord {
  return {
    id: row.id,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text ?? null,
    audience: parseAudience(row.audience_json),
    recipientCount: Number(row.recipient_count ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    status: row.status,
    createdAt: row.created_at,
    sentAt: row.sent_at ?? null,
    sentBy: row.sent_by,
  };
}

export function isMarkdown(value: string): boolean {
  return !/<\s*(?:html|body|table|p|div|article|section|header|h[1-6]|ul|ol|li|a|img|br|strong|em|blockquote|pre|code)\b/i.test(
    value
  );
}

const INLINE_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /(?<!["'>=])(https?:\/\/[^\s<]+)/g;
const UNSAFE_HTML_SELECTOR = [
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'meta',
  'noscript',
  'object',
  'option',
  'script',
  'select',
  'style',
  'template',
  'textarea',
].join(',');
const URL_ATTRIBUTES = new Set(['action', 'formaction', 'href', 'poster', 'src', 'xlink:href']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isUnsafeAttributeUrl(value: string): boolean {
  const normalized = value.replace(/[\u0000-\u001f\u007f\s]+/g, '').toLowerCase();
  return normalized.startsWith('javascript:') || normalized.startsWith('vbscript:') || normalized.startsWith('data:');
}

function isUnsafeStyle(value: string): boolean {
  return /expression\s*\(|javascript\s*:|url\s*\(\s*['"]?\s*javascript:/i.test(value);
}

function sanitizeHtmlFragment(value: string): string {
  const $ = load(value, { decodeEntities: false }, false);
  $(UNSAFE_HTML_SELECTOR).remove();

  $('*').each((_index, element) => {
    if (!('attribs' in element)) {
      return;
    }
    const attributes = element.attribs ?? {};
    for (const [name, rawValue] of Object.entries(attributes)) {
      const lowerName = name.toLowerCase();
      const value = String(rawValue ?? '');
      if (
        lowerName.startsWith('on')
        || (URL_ATTRIBUTES.has(lowerName) && isUnsafeAttributeUrl(value))
        || (lowerName === 'style' && isUnsafeStyle(value))
      ) {
        $(element).removeAttr(name);
      }
    }
  });

  return $.root().html()?.trim() ?? '';
}

function htmlToPlainText(value: string): string {
  const $ = load(sanitizeHtmlFragment(value), {}, false);
  return $.root()
    .text()
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function renderInline(line: string): string {
  let out = escapeHtml(line);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(INLINE_LINK, '<a href="$2" style="color:#111;text-decoration:underline;">$1</a>');
  out = out.replace(BARE_URL, '<a href="$1" style="color:#111;text-decoration:underline;">$1</a>');
  return out;
}

export function renderBodyToHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  if (!isMarkdown(trimmed)) {
    return sanitizeHtmlFragment(trimmed);
  }
  const blocks = trimmed.split(/\n{2,}/g);
  return blocks
    .map((block) => {
      const heading = /^(#{1,3})\s+(.*)$/.exec(block.trim());
      if (heading) {
        const level = Math.min(heading[1].length + 1, 4);
        return `<h${level} style="margin:0 0 12px;font-family:${FONT_DISPLAY};font-size:${level === 2 ? 22 : level === 3 ? 18 : 16}px;font-weight:600;color:#111;">${escapeHtml(heading[2])}</h${level}>`;
      }
      const lines = block.split(/\n/g).map(renderInline).join('<br />');
      return `<p style="margin:0 0 14px;font-family:${FONT_DISPLAY};font-size:15px;line-height:1.65;color:#111;">${lines}</p>`;
    })
    .join('\n');
}

export function renderBodyToText(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  if (!isMarkdown(trimmed)) {
    return htmlToPlainText(trimmed);
  }

  return trimmed
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function broadcastShell(subject: string, bodyHtml: string, unsubscribeUrl: string | null): string {
  const unsubscribeFooter = unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#888;font-family:${FONT_DISPLAY};">You're receiving this because you subscribed at buxx.me. <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a>.</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f7;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f7;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;border:1px solid #ececec;">
      <tr><td style="padding:36px 36px 28px;">
        ${bodyHtml}
        ${unsubscribeFooter}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function audienceWhereClause(audience: BroadcastAudience): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (audience.status && audience.status !== 'active') {
    where.push('status = ?');
    params.push(audience.status);
  } else {
    where.push("status = 'active'");
  }
  if (audience.deliveryModes?.length) {
    const placeholders = audience.deliveryModes.map(() => '?').join(',');
    where.push(`delivery_mode IN (${placeholders})`);
    params.push(...audience.deliveryModes);
  }
  if (audience.channels?.length) {
    const channelClauses = audience.channels.map(() => 'channels LIKE ?').join(' OR ');
    where.push(`(${channelClauses})`);
    audience.channels.forEach((channel) => params.push(`%"${channel}"%`));
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function resolveAudience(
  d1: NotifyD1Client,
  audience: BroadcastAudience
): Promise<SubscriberRow[]> {
  const { sql, params } = audienceWhereClause(audience);
  return d1.query<SubscriberRow>(
    `SELECT email, email_hash, status, delivery_mode, channels
     FROM notify_subscribers
     ${sql}
     ORDER BY email_hash
     LIMIT 10000`,
    params
  );
}

export async function countAudience(
  context: AdminContext,
  audience: BroadcastAudience
): Promise<number> {
  const d1 = createAdminD1(context);
  const { sql, params } = audienceWhereClause(audience);
  const row = await d1.first<{ total: number }>(
    `SELECT COUNT(*) as total FROM notify_subscribers ${sql}`,
    params
  );
  return Number(row?.total ?? 0);
}

export async function listBroadcasts(
  context: AdminContext,
  options: { limit?: number; offset?: number } = {}
): Promise<BroadcastRecord[]> {
  const d1 = createAdminD1(context);
  const limit = Math.max(1, Math.min(options.limit ?? 30, 200));
  const offset = Math.max(0, options.offset ?? 0);
  const rows = await d1.query<BroadcastRow>(
    `SELECT ${BROADCAST_COLUMNS}
     FROM notify_broadcasts
     ORDER BY datetime(created_at) DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows.map(mapBroadcastRow);
}

export async function getBroadcast(
  context: AdminContext,
  id: string
): Promise<BroadcastRecord | null> {
  const d1 = createAdminD1(context);
  const row = await d1.first<BroadcastRow>(
    `SELECT ${BROADCAST_COLUMNS} FROM notify_broadcasts WHERE id = ? LIMIT 1`,
    [id]
  );
  return row ? mapBroadcastRow(row) : null;
}

function getSiteOrigin(context: AdminContext): string {
  const config = getNotifyConfig({ locals: context.locals });
  if (config.siteUrl) return config.siteUrl;
  return new URL(context.request.url).origin;
}

export async function previewBroadcast(
  context: AdminContext,
  input: BroadcastInput
): Promise<BroadcastPreviewResult> {
  const subject = input.subject.trim();
  if (!subject) throw new Error('subject_required');
  const body = input.body.trim();
  if (!body) throw new Error('body_required');

  const html = broadcastShell(subject, renderBodyToHtml(body), `${getSiteOrigin(context)}/api/notify/unsubscribe`);
  const text = renderBodyToText(body);
  const recipientCount = await countAudience(context, input.audience);

  return { subject, html, text, recipientCount };
}

interface BroadcastInsertInput {
  id: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  audience: BroadcastAudience;
  recipientCount: number;
  sentBy: string;
}

async function insertBroadcastRow(
  d1: NotifyD1Client,
  input: BroadcastInsertInput
): Promise<void> {
  const now = new Date().toISOString();
  await d1.run(
    `INSERT INTO notify_broadcasts (
      id, subject, body_html, body_text, audience_json,
      recipient_count, sent_count, failed_count, status,
      created_at, sent_at, sent_by
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'sending', ?, NULL, ?)`,
    [
      input.id,
      input.subject,
      input.bodyHtml,
      input.bodyText,
      JSON.stringify(input.audience),
      input.recipientCount,
      now,
      input.sentBy,
    ]
  );
}

async function finalizeBroadcastRow(
  d1: NotifyD1Client,
  id: string,
  sentCount: number,
  failedCount: number
): Promise<BroadcastRecord['status']> {
  const status: BroadcastRecord['status'] =
    failedCount > 0 ? 'failed' : sentCount > 0 ? 'sent' : 'failed';
  const sentAt = new Date().toISOString();
  await d1.run(
    `UPDATE notify_broadcasts
     SET sent_count = ?, failed_count = ?, status = ?, sent_at = ?
     WHERE id = ?`,
    [sentCount, failedCount, status, sentAt, id]
  );
  return status;
}

async function writeBroadcastAuditEvent(
  d1: NotifyD1Client,
  input: {
    id: string;
    subject: string;
    actor: string;
  }
): Promise<void> {
  try {
    await d1.run(
      `INSERT INTO notify_audit (
        event_type, email_hash, email, source, user_agent, ip_hash, token_hash, created_at
      ) VALUES ('broadcast_sent', ?, ?, ?, NULL, NULL, NULL, ?)`,
      [
        input.id,
        `broadcast:${input.subject.slice(0, 80)}`,
        `admin:${input.actor}`,
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    console.error('Broadcast audit write failed:', error);
  }
}

export async function sendBroadcast(
  context: AdminContext,
  input: BroadcastInput
): Promise<BroadcastSendResult> {
  const config = getNotifyConfig({ locals: context.locals });
  requireConfigValue(config.resendApiKey, 'RESEND_API_KEY');
  requireConfigValue(config.notifyFrom, 'NOTIFY_FROM_EMAIL');

  const subject = input.subject.trim();
  if (!subject) throw new Error('subject_required');
  const body = input.body.trim();
  if (!body) throw new Error('body_required');
  if (!input.audience.channels?.length) throw new Error('audience_required');

  const validChannels = input.audience.channels.filter((channel) =>
    (NOTIFY_CHANNELS as readonly string[]).includes(channel)
  );
  if (!validChannels.length) throw new Error('audience_required');

  const d1 = createAdminD1(context);
  const audience = await resolveAudience(d1, { ...input.audience, channels: validChannels });
  if (!audience.length) throw new Error('audience_empty');

  const broadcastId = `bc_${randomBytes(8).toString('hex')}`;
  const bodyHtmlInner = renderBodyToHtml(body);
  const bodyText = renderBodyToText(body);

  await insertBroadcastRow(d1, {
    id: broadcastId,
    subject,
    bodyHtml: bodyHtmlInner,
    bodyText,
    audience: { ...input.audience, channels: validChannels },
    recipientCount: audience.length,
    sentBy: context.actor,
  });

  let sentCount = 0;
  let failedCount = 0;
  const fromAddress = getNotifyFromAddress(config);
  const siteOrigin = getSiteOrigin(context);

  for (const subscriber of audience) {
    const email = normalizeEmail(subscriber.email);
    if (!isValidEmail(email)) {
      failedCount += 1;
      continue;
    }
    try {
      const html = broadcastShell(subject, bodyHtmlInner, `${siteOrigin}/api/notify/unsubscribe?email=${encodeURIComponent(email)}`);
      await sendEmailWithResend({
        apiKey: config.resendApiKey,
        from: fromAddress,
        to: email,
        replyTo: config.notifyReplyTo || undefined,
        subject,
        html,
        text: bodyText,
        idempotencyKey: `broadcast-${broadcastId}-${hashEmail(email)}`,
      });
      sentCount += 1;
    } catch (error) {
      console.error('Broadcast send failed:', error);
      failedCount += 1;
    }
  }

  const status = await finalizeBroadcastRow(d1, broadcastId, sentCount, failedCount);

  await writeBroadcastAuditEvent(d1, {
    id: broadcastId,
    subject,
    actor: context.actor,
  });

  return {
    id: broadcastId,
    recipientCount: audience.length,
    sentCount,
    failedCount,
    status,
  };
}
