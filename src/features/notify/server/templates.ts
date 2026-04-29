import * as cheerio from 'cheerio';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimPreview(value: string, maxLength = 140): string {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function escapeHtmlWithLineBreaks(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

const MONO_FONT = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, 'Courier New', monospace";
const EMAIL_PREVIEW_STYLE = `font-family: ${MONO_FONT}; font-size: 14px; line-height: 1.65; color: #111;`;
const EMAIL_PREVIEW_COMPACT_STYLE = `font-family: ${MONO_FONT}; font-size: 13px; line-height: 1.65; color: #111;`;
const EMAIL_LINK_STYLE = 'color: #111; text-decoration: underline; text-decoration-thickness: 1px;';
const EMAIL_QUOTE_STYLE = 'margin: 0 0 10px; padding: 0 0 0 12px; border-left: 2px solid #d4d4d4; color: #333;';
const EMAIL_CODE_STYLE = `font-family: ${MONO_FONT}; font-size: 0.92em; background-color: #f4f4f5; color: #111; padding: 1px 4px; border-radius: 4px;`;
const EMAIL_PRE_STYLE = `margin: 8px 0 10px; padding: 10px 12px; overflow-x: auto; font-family: ${MONO_FONT}; font-size: 12px; line-height: 1.55; background-color: #f4f4f5; color: #111; border-radius: 8px;`;

interface EmailRelatedLink {
  url: string;
  type?: 'link' | 'image';
}

function sanitizeExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeRelatedLinks(
  links: EmailRelatedLink[] | undefined,
  maxCount: number
): Array<{ url: string; type: 'link' | 'image' }> {
  if (!links?.length) return [];

  const normalized: Array<{ url: string; type: 'link' | 'image' }> = [];
  const seen = new Set<string>();

  for (const item of links) {
    const url = sanitizeExternalUrl(item?.url || '');
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    normalized.push({
      url,
      type: item?.type === 'image' ? 'image' : 'link',
    });

    if (normalized.length >= maxCount) {
      break;
    }
  }

  return normalized;
}

function formatLinkLabel(value: string, maxLength = 80): string {
  const compact = value.replace(/^https?:\/\//i, '');
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 3)}...`;
}

function renderEmailRichNode($: cheerio.CheerioAPI, node: cheerio.AnyNode): string {
  if (node.type === 'text') {
    return escapeHtml(node.data ?? '');
  }

  if (node.type !== 'tag') {
    return '';
  }

  const element = node as cheerio.Element;
  const tag = element.tagName?.toLowerCase();
  const children = $(element)
    .contents()
    .toArray()
    .map((child) => renderEmailRichNode($, child))
    .join('');

  if (!tag) {
    return children;
  }

  if (tag === 'br') {
    return '<br />';
  }

  if (tag === 'a') {
    const href = sanitizeExternalUrl($(element).attr('href') ?? '');
    if (!href || !children.trim()) {
      return children;
    }
    return `<a href="${escapeHtml(href)}" class="email-link" style="${EMAIL_LINK_STYLE}">${children}</a>`;
  }

  if (tag === 'blockquote') {
    return `<div class="email-quote" style="${EMAIL_QUOTE_STYLE}">${children}</div>`;
  }

  if (tag === 'pre') {
    return `<pre class="email-code-block" style="${EMAIL_PRE_STYLE}">${children}</pre>`;
  }

  if (tag === 'code') {
    return `<code class="email-code" style="${EMAIL_CODE_STYLE}">${children}</code>`;
  }

  if (tag === 'strong' || tag === 'b') {
    return `<strong style="font-weight: 700;">${children}</strong>`;
  }

  if (tag === 'em' || tag === 'i') {
    return `<em style="font-style: italic;">${children}</em>`;
  }

  if (tag === 'u') {
    return `<span style="text-decoration: underline;">${children}</span>`;
  }

  if (tag === 's' || tag === 'del' || tag === 'strike') {
    return `<span style="text-decoration: line-through;">${children}</span>`;
  }

  if (tag === 'img') {
    return escapeHtml($(element).attr('alt') ?? '');
  }

  return children;
}

function renderEmailRichPreview(previewHtml: string | undefined, compact = false): string {
  const html = (previewHtml ?? '').trim();
  if (!html) {
    return '';
  }

  if (!/<(?:a|blockquote|br|pre|code|b|strong|i|em|u|s|del|strike)\b/i.test(html)) {
    return '';
  }

  const $ = cheerio.load(html, { decodeEntities: false });
  const rendered = $.root()
    .contents()
    .toArray()
    .map((node) => renderEmailRichNode($, node))
    .join('')
    .trim();

  if (!rendered) {
    return '';
  }

  const style = compact ? EMAIL_PREVIEW_COMPACT_STYLE : EMAIL_PREVIEW_STYLE;
  return `<div class="email-preview email-rich-text" style="${style}">${rendered}</div>`;
}

function renderEmailTextPreview(previewText: string, options: { compact?: boolean; maxLength?: number } = {}): string {
  const style = options.compact ? EMAIL_PREVIEW_COMPACT_STYLE : EMAIL_PREVIEW_STYLE;
  const preview = trimPreview(previewText || '(No text preview)', options.maxLength);
  return `<div class="email-preview" style="${style}">${escapeHtmlWithLineBreaks(preview)}</div>`;
}

function buildRelatedLinksHtml(
  links: EmailRelatedLink[] | undefined,
  options: { maxCount?: number; compact?: boolean } = {}
): string {
  const normalized = normalizeRelatedLinks(links, options.maxCount ?? 6);
  if (!normalized.length) {
    return '';
  }

  const compact = Boolean(options.compact);
  const imageLinks = normalized.filter((link) => link.type === 'image');
  const textLinks = normalized.filter((link) => link.type !== 'image');
  const blockStyle = compact
    ? 'margin-top: 8px;'
    : 'margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e5e5;';
  const headingStyle = compact
    ? `font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #666;`
    : `font-family: ${MONO_FONT}; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #666;`;
  const imageStyle = compact
    ? 'display: block; width: 100%; max-width: 260px; margin-top: 6px; border: 1px solid #e5e5e5; border-radius: 8px;'
    : 'display: block; width: 100%; max-width: 420px; margin-top: 8px; border: 1px solid #e5e5e5; border-radius: 10px;';
  const linkStyle = compact
    ? `display: block; margin-top: 4px; font-family: ${MONO_FONT}; font-size: 11px; color: #111; text-decoration: none; line-height: 1.45;`
    : `display: block; margin-top: 6px; font-family: ${MONO_FONT}; font-size: 12px; color: #111; text-decoration: none; line-height: 1.45;`;

  const imagePreviewLinks = imageLinks.slice(0, 1);
  const imageLines = imagePreviewLinks
    .map((link) => `<img src="${escapeHtml(link.url)}" alt="Mood image" loading="lazy" style="${imageStyle}" />`)
    .join('');
  const textLines = textLinks
    .map((link) => {
      const label = `🔗 ${formatLinkLabel(link.url, compact ? 72 : 84)}`;
      return `<a href="${escapeHtml(link.url)}" class="email-link" style="${linkStyle}">${escapeHtml(label)}</a>`;
    })
    .join('');
  const imageBlock = imageLines
    ? `
                        ${imageLines}`
    : '';
  const textBlock = textLines
    ? `
                        <div class="email-meta" style="${headingStyle}${imageLines ? ' margin-top: 10px;' : ''}">${compact ? 'Links' : 'Related links'}</div>
                        ${textLines}`
    : '';

  return `
                      <div style="${blockStyle}">
                        ${imageBlock}
                        ${textBlock}
                      </div>`;
}

function buildRelatedLinksTextLines(
  links: EmailRelatedLink[] | undefined,
  options: { maxCount?: number; heading?: string } = {}
): string[] {
  const normalized = normalizeRelatedLinks(links, options.maxCount ?? 6);
  if (!normalized.length) {
    return [];
  }

  const lines = [options.heading || 'Related links:'];
  for (const link of normalized) {
    if (link.type === 'image') {
      continue;
    }
    lines.push(`- ${link.url}`);
  }

  if (lines.length === 1) {
    return [];
  }
  return lines;
}

function emailShell(content: string): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #0a0a0a !important; }
      .email-card { background-color: #0a0a0a !important; }
      .email-text { color: #e5e5e5 !important; }
      .email-muted { color: #888 !important; }
      .email-link { color: #e5e5e5 !important; }
      .email-divider { border-color: #333 !important; }
      .email-label { color: #888 !important; }
      .email-grid-dot { opacity: 0.1 !important; }
      .email-embed-card { background-color: #0f0f0f !important; border-color: #2b2b2b !important; }
      .email-embed-header { border-color: #2b2b2b !important; }
      .email-embed-footer { border-color: #2b2b2b !important; }
      .email-avatar { background-color: #242424 !important; color: #e5e5e5 !important; }
      .email-channel-name { color: #e5e5e5 !important; }
      .email-channel-meta { color: #8a8a8a !important; }
      .email-preview { color: #e5e5e5 !important; }
      .email-view-link { color: #e5e5e5 !important; }
      .email-meta { color: #8a8a8a !important; }
      .email-quote { color: #d4d4d4 !important; border-color: #444 !important; }
      .email-code { background-color: #1f1f1f !important; color: #e5e5e5 !important; }
      .email-code-block { background-color: #1f1f1f !important; color: #e5e5e5 !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #fff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff;" class="email-body">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width: 560px; width: 100%; background-color: #fff;">
          ${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildSubscribeConfirmEmail(options: {
  siteUrl: string;
  confirmUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Confirm your mood subscription';
  const html = emailShell(`
          <!-- Header label -->
          <tr>
            <td style="padding: 28px 28px 0;">
              <span class="email-label" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #666;">subscription</span>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td class="email-text" style="padding: 16px 28px 0; font-family: ${MONO_FONT}; font-size: 18px; font-weight: 600; color: #000; letter-spacing: -0.01em;">
              Confirm subscription
            </td>
          </tr>
          <!-- Body text -->
          <tr>
            <td class="email-muted" style="padding: 12px 28px 0; font-family: ${MONO_FONT}; font-size: 13px; line-height: 1.7; color: #666;">
              Click the button below to activate your mood update notifications.
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td style="padding: 24px 28px 0;">
              <a href="${escapeHtml(options.confirmUrl)}" class="email-btn" style="display: inline-block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 500; color: #fff; background-color: #111; text-decoration: none; padding: 10px 20px; border: 2px solid #2b2b2b;">
                <span class="email-btn-text" style="color: #fff; -webkit-text-fill-color: #fff;">Confirm &rarr;</span>
              </a>
            </td>
          </tr>
          <!-- Fallback confirm link -->
          <tr>
            <td class="email-muted" style="padding: 12px 28px 0; font-family: ${MONO_FONT}; font-size: 11px; line-height: 1.7; color: #999;">
              If you cannot see the button, open this link:
              <br />
              <a href="${escapeHtml(options.confirmUrl)}" class="email-link" style="font-family: ${MONO_FONT}; font-size: 12px; color: #000; text-decoration: underline; word-break: break-all;">${escapeHtml(options.confirmUrl)}</a>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 24px 28px 0;">
              <hr class="email-divider" style="border: none; border-top: 1px dashed #ccc; margin: 0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 28px 28px;">
              <p class="email-muted" style="margin: 0 0 4px; font-family: ${MONO_FONT}; font-size: 11px; color: #999; line-height: 1.6;">If you did not request this, ignore this email.</p>
              <a href="${escapeHtml(options.siteUrl)}" class="email-link" style="font-family: ${MONO_FONT}; font-size: 11px; color: #000; text-decoration: none;">${escapeHtml(options.siteUrl)}</a>
            </td>
          </tr>`);

  const text = [
    'SUBSCRIPTION',
    '────────────',
    '',
    'Confirm your mood subscription',
    '',
    `Open this link: ${options.confirmUrl}`,
    'If the button is not visible, use the link above.',
    '',
    'If you did not request this, ignore this email.',
    `Site: ${options.siteUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export function buildMoodNotificationEmail(options: {
  moodUrl: string;
  unsubscribeUrl: string;
  previewText: string;
  previewHtml?: string;
  relatedLinks?: EmailRelatedLink[];
  postId: string;
  channelTitle?: string;
  channelAvatarUrl?: string;
}): { subject: string; html: string; text: string } {
  const preview = trimPreview(options.previewText || '(No text preview)');
  const previewHtml = renderEmailRichPreview(options.previewHtml) || renderEmailTextPreview(preview);
  const channelTitle = (options.channelTitle || 'Mood Feed').trim() || 'Mood Feed';
  const channelInitial = channelTitle.charAt(0).toUpperCase() || 'M';
  const channelAvatarUrl = (options.channelAvatarUrl || '').trim();
  const channelAvatarHtml = channelAvatarUrl
    ? `<img src="${escapeHtml(channelAvatarUrl)}" alt="${escapeHtml(channelTitle)} avatar" width="32" height="32" style="display: block; width: 32px; height: 32px; border-radius: 999px;" />`
    : escapeHtml(channelInitial);
  const relatedLinksHtml = buildRelatedLinksHtml(options.relatedLinks, { maxCount: 6 });
  const relatedLinksTextLines = buildRelatedLinksTextLines(options.relatedLinks, { maxCount: 6 });
  const subject = `New mood #${options.postId}`;
  const html = emailShell(`
          <tr>
            <td style="padding: 24px 24px 0;">
              <span class="email-label" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #666;">mood update</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-embed-card" style="border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; background-color: #fff;">
                <tr>
                  <td class="email-embed-header" style="padding: 12px 14px; border-bottom: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" valign="middle">
                          <div class="email-avatar" style="width: 32px; height: 32px; border-radius: 999px; background: #f3f4f6; color: #111; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; line-height: 32px; text-align: center; overflow: hidden;">${channelAvatarHtml}</div>
                        </td>
                        <td valign="middle" style="padding-left: 10px;">
                          <a href="${escapeHtml(options.moodUrl)}" class="email-channel-name" style="display: inline-block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; color: #111; text-decoration: none;">${escapeHtml(channelTitle)}</a>
                          <div class="email-channel-meta" style="margin-top: 2px; font-family: ${MONO_FONT}; font-size: 11px; color: #666;">New mood posted &middot; #${escapeHtml(options.postId)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px;">
                    ${previewHtml}
                    ${relatedLinksHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 14px 14px;">
                    <a href="${escapeHtml(options.moodUrl)}" class="email-view-link" style="font-family: ${MONO_FONT}; font-size: 12px; color: #000; text-decoration: none;">View full mood &rarr;</a>
                  </td>
                </tr>
                <tr>
                  <td class="email-embed-footer" style="padding: 10px 14px; border-top: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="right">
                          <a href="${escapeHtml(options.unsubscribeUrl)}" class="email-muted" style="font-family: ${MONO_FONT}; font-size: 11px; color: #666; text-decoration: none;">Unsubscribe &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);

  const textLines = [
    `MOOD · #${options.postId}`,
    '────────────',
    '',
    preview,
    '',
  ];

  if (relatedLinksTextLines.length) {
    textLines.push(...relatedLinksTextLines);
    textLines.push('');
  }

  textLines.push(`Read: ${options.moodUrl}`);
  textLines.push(`Unsubscribe: ${options.unsubscribeUrl}`);

  return { subject, html, text: textLines.join('\n') };
}

interface MoodDigestPost {
  postId: string;
  moodUrl: string;
  previewText: string;
  previewHtml?: string;
  relatedLinks?: EmailRelatedLink[];
  timeLabel: string;
  dateLabel: string;
}

function buildDigestListHtml(posts: MoodDigestPost[]): string {
  let currentDate = '';
  const rows: string[] = [];

  for (const post of posts) {
    const richPreview = renderEmailRichPreview(post.previewHtml, true);
    const previewHtml = richPreview
      ? `${richPreview}
                          <a href="${escapeHtml(post.moodUrl)}" class="email-view-link" style="display: inline-block; margin-top: 6px; font-family: ${MONO_FONT}; font-size: 11px; color: #000; text-decoration: none;">Read mood &rarr;</a>`
      : `<a href="${escapeHtml(post.moodUrl)}" class="email-preview" style="display: block; font-family: ${MONO_FONT}; font-size: 13px; line-height: 1.65; color: #111; text-decoration: none;">
                            ${escapeHtmlWithLineBreaks(trimPreview(post.previewText, 160))}
                          </a>`;

    if (post.dateLabel && post.dateLabel !== currentDate) {
      currentDate = post.dateLabel;
      rows.push(`
                <tr>
                  <td style="padding: 14px 14px 6px; font-family: ${MONO_FONT}; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #666;">
                    ${escapeHtml(post.dateLabel)}
                  </td>
                </tr>`);
    }

    rows.push(`
                <tr>
                  <td style="padding: 0 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #efefef;">
                      <tr>
                        <td valign="top" width="56" style="padding: 10px 0; font-family: ${MONO_FONT}; font-size: 11px; color: #666;">
                          ${escapeHtml(post.timeLabel)}
                        </td>
                        <td valign="top" style="padding: 10px 0;">
                          ${previewHtml}
                          ${buildRelatedLinksHtml(post.relatedLinks, { maxCount: 4, compact: true })}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`);
  }

  return rows.join('');
}

export function buildMoodDigestEmail(options: {
  mode: 'every_5h' | 'daily';
  moodUrl: string;
  unsubscribeUrl: string;
  channelTitle?: string;
  channelAvatarUrl?: string;
  posts: MoodDigestPost[];
}): { subject: string; html: string; text: string } {
  const channelTitle = (options.channelTitle || 'Mood Feed').trim() || 'Mood Feed';
  const channelInitial = channelTitle.charAt(0).toUpperCase() || 'M';
  const channelAvatarUrl = (options.channelAvatarUrl || '').trim();
  const channelAvatarHtml = channelAvatarUrl
    ? `<img src="${escapeHtml(channelAvatarUrl)}" alt="${escapeHtml(channelTitle)} avatar" width="32" height="32" style="display: block; width: 32px; height: 32px; border-radius: 999px;" />`
    : escapeHtml(channelInitial);
  const count = options.posts.length;
  const modeLabel = options.mode === 'daily' ? 'Daily digest' : '5-hour digest';
  const subject = `${modeLabel} · ${count} mood update${count > 1 ? 's' : ''}`;

  const html = emailShell(`
          <tr>
            <td style="padding: 24px 24px 0;">
              <span class="email-label" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #666;">mood digest</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-embed-card" style="border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; background-color: #fff;">
                <tr>
                  <td class="email-embed-header" style="padding: 12px 14px; border-bottom: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" valign="middle">
                          <div class="email-avatar" style="width: 32px; height: 32px; border-radius: 999px; background: #f3f4f6; color: #111; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; line-height: 32px; text-align: center; overflow: hidden;">${channelAvatarHtml}</div>
                        </td>
                        <td valign="middle" style="padding-left: 10px;">
                          <a href="${escapeHtml(options.moodUrl)}" class="email-channel-name" style="display: inline-block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; color: #111; text-decoration: none;">${escapeHtml(channelTitle)}</a>
                          <div class="email-channel-meta" style="margin-top: 2px; font-family: ${MONO_FONT}; font-size: 11px; color: #666;">${escapeHtml(modeLabel)} &middot; ${count} update${count > 1 ? 's' : ''}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${buildDigestListHtml(options.posts)}
                <tr>
                  <td class="email-embed-footer" style="padding: 10px 14px; border-top: 1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <a href="${escapeHtml(options.moodUrl)}" class="email-view-link" style="font-family: ${MONO_FONT}; font-size: 11px; color: #000; text-decoration: none;">View mood feed &rarr;</a>
                        </td>
                        <td align="right">
                          <a href="${escapeHtml(options.unsubscribeUrl)}" class="email-muted" style="font-family: ${MONO_FONT}; font-size: 11px; color: #666; text-decoration: none;">Unsubscribe &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);

  const textLines: string[] = [
    modeLabel.toUpperCase(),
    '────────────',
    '',
  ];

  let currentDate = '';
  for (const post of options.posts) {
    if (post.dateLabel && post.dateLabel !== currentDate) {
      currentDate = post.dateLabel;
      textLines.push(post.dateLabel);
    }

    textLines.push(`[${post.timeLabel}] ${trimPreview(post.previewText, 160)}`);
    const relatedLinkLines = buildRelatedLinksTextLines(post.relatedLinks, {
      maxCount: 4,
      heading: 'Links:',
    });
    if (relatedLinkLines.length) {
      textLines.push(...relatedLinkLines);
    }
    textLines.push(`Read: ${post.moodUrl}`);
    textLines.push('');
  }

  textLines.push(`Feed: ${options.moodUrl}`);
  textLines.push(`Unsubscribe: ${options.unsubscribeUrl}`);

  return { subject, html, text: textLines.join('\n') };
}
