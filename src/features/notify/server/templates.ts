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
const EMAIL_BOOKMARK_CARD_STYLE = 'display: block; margin: 12px 0 2px; border: 1px solid #d8d8d8; border-radius: 9px; overflow: hidden; background-color: #fafafa; color: #111; text-decoration: none;';
const EMAIL_BOOKMARK_MEDIA_STYLE = 'display: block; width: 100%; max-width: 420px; border: 0;';
const EMAIL_BOOKMARK_CONTENT_STYLE = 'display: block; padding: 12px 14px 13px;';
const EMAIL_BOOKMARK_TITLE_STYLE = `display: block; font-family: ${MONO_FONT}; font-size: 13px; font-weight: 600; line-height: 1.42; color: #111; word-break: normal; overflow-wrap: break-word;`;
const EMAIL_BOOKMARK_DESCRIPTION_STYLE = `display: block; margin-top: 6px; font-family: ${MONO_FONT}; font-size: 12px; font-weight: 400; line-height: 1.5; color: #666; word-break: normal; overflow-wrap: break-word;`;
const EMAIL_BOOKMARK_META_STYLE = `display: block; margin: 0 0 7px; font-family: ${MONO_FONT}; font-size: 10px; font-weight: 600; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8a8a; word-break: normal; overflow-wrap: break-word;`;

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

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparableUrl(value: string): string {
  const safeUrl = sanitizeExternalUrl(value);
  if (!safeUrl) {
    return '';
  }

  try {
    const parsed = new URL(safeUrl);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function hasClass(element: cheerio.Element, className: string): boolean {
  return (` ${element.attribs?.class ?? ''} `).includes(` ${className} `);
}

function hasBookmarkPreview(previewHtml: string | undefined): boolean {
  return /\bclass=["'][^"']*\bbookmark-card\b/i.test(previewHtml ?? '');
}

function removeRedundantBookmarkUrlLinks($: cheerio.CheerioAPI): void {
  const bookmarkUrls = new Set<string>();

  $('.bookmark-card[href]').each((_index, element) => {
    const url = normalizeComparableUrl($(element).attr('href') ?? '');
    if (url) {
      bookmarkUrls.add(url);
    }
  });

  if (!bookmarkUrls.size) {
    return;
  }

  $('a[href]').each((_index, element) => {
    if (hasClass(element, 'bookmark-card')) {
      return;
    }

    const href = normalizeComparableUrl($(element).attr('href') ?? '');
    const label = normalizeComparableUrl(compactText($(element).text()));
    if (href && label && href === label && bookmarkUrls.has(href)) {
      $(element).remove();
    }
  });
}

function trimEmailRichHtml(value: string): string {
  return value
    .trim()
    .replace(/^(?:\s|<br\s*\/?>)+/gi, '')
    .replace(/(?:\s|<br\s*\/?>)+$/gi, '')
    .trim();
}

function renderEmailBookmarkCard($: cheerio.CheerioAPI, element: cheerio.Element): string {
  const href = sanitizeExternalUrl($(element).attr('href') ?? '');
  const title = compactText($(element).find('.bookmark-card__title').first().text()) || formatLinkLabel(href, 120);
  if (!href || !title) {
    return escapeHtml(compactText($(element).text()));
  }

  const description = compactText($(element).find('.bookmark-card__description').first().text());
  const meta = compactText($(element).find('.bookmark-card__meta').first().text());
  const imageSrc = sanitizeExternalUrl($(element).find('.bookmark-card__media img').first().attr('src') ?? '');
  const imageAlt = compactText($(element).find('.bookmark-card__media img').first().attr('alt') ?? title);
  const imageHtml = imageSrc
    ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}" class="email-bookmark-media" loading="lazy" style="${EMAIL_BOOKMARK_MEDIA_STYLE}" />`
    : '';
  const descriptionHtml = description
    ? `<span class="email-bookmark-description" style="${EMAIL_BOOKMARK_DESCRIPTION_STYLE}">${escapeHtml(description)}</span>`
    : '';
  const metaHtml = meta
    ? `<span class="email-bookmark-meta" style="${EMAIL_BOOKMARK_META_STYLE}">${escapeHtml(meta)}</span>`
    : '';

  return `<a href="${escapeHtml(href)}" class="email-bookmark-card email-link" style="${EMAIL_BOOKMARK_CARD_STYLE}">
    ${imageHtml}
    <span class="email-bookmark-content" style="${EMAIL_BOOKMARK_CONTENT_STYLE}">
      ${metaHtml}
      <span class="email-bookmark-title" style="${EMAIL_BOOKMARK_TITLE_STYLE}">${escapeHtml(title)}</span>
      ${descriptionHtml}
    </span>
  </a>`;
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
    if (hasClass(element, 'bookmark-card')) {
      return renderEmailBookmarkCard($, element);
    }

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
  removeRedundantBookmarkUrlLinks($);
  const rendered = $.root()
    .contents()
    .toArray()
    .map((node) => renderEmailRichNode($, node))
    .join('')
  const trimmed = trimEmailRichHtml(rendered);

  if (!trimmed) {
    return '';
  }

  const style = compact ? EMAIL_PREVIEW_COMPACT_STYLE : EMAIL_PREVIEW_STYLE;
  return `<div class="email-preview email-rich-text" style="${style}">${trimmed}</div>`;
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

const SANS_FONT = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function emailShell(content: string, options: { siteUrl?: string } = {}): string {
  const siteUrl = (options.siteUrl || 'https://buxx.me').replace(/\/$/, '');
  const privacyUrl = `${siteUrl}/privacy`;
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
      .email-card { background-color: #131313 !important; border-color: #1f1f1f !important; }
      .email-text { color: #fafafa !important; }
      .email-muted { color: #9b9b9b !important; }
      .email-soft { color: #6c6c70 !important; }
      .email-link { color: #fafafa !important; }
      .email-divider { border-color: rgba(255,255,255,0.08) !important; }
      .email-eyebrow { color: #9b9b9b !important; }
      .email-brand-text { color: #fafafa !important; }
      .email-status-dot { background-color: #fafafa !important; }
      .email-status-dot--error { background-color: #f87171 !important; }
      .email-status-dot--success { background-color: #22c55e !important; }
      .email-btn-pill { background-color: #fafafa !important; color: #0a0a0a !important; border-color: #fafafa !important; }
      .email-btn-text { color: #0a0a0a !important; -webkit-text-fill-color: #0a0a0a !important; }
      .email-fallback-url { background-color: rgba(255,255,255,0.04) !important; border-color: rgba(255,255,255,0.08) !important; color: #fafafa !important; }
      .email-chip { background-color: rgba(255,255,255,0.04) !important; border-color: rgba(255,255,255,0.08) !important; }
      .email-chip--active { background-color: #fafafa !important; border-color: #fafafa !important; }
      .email-chip-text { color: #fafafa !important; }
      .email-chip--active .email-chip-text { color: #0a0a0a !important; }
      .email-embed-card { background-color: #0f0f0f !important; border-color: #2b2b2b !important; }
      .email-embed-header { border-color: #2b2b2b !important; }
      .email-embed-footer { border-color: #2b2b2b !important; }
      .email-avatar { background-color: #242424 !important; color: #fafafa !important; }
      .email-channel-name { color: #fafafa !important; }
      .email-channel-meta { color: #8a8a8a !important; }
      .email-preview { color: #fafafa !important; }
      .email-view-link { color: #fafafa !important; }
      .email-meta { color: #8a8a8a !important; }
      .email-quote { color: #d4d4d4 !important; border-color: #444 !important; }
      .email-code { background-color: #1f1f1f !important; color: #fafafa !important; }
      .email-code-block { background-color: #1f1f1f !important; color: #fafafa !important; }
      .email-bookmark-card { background-color: #0f0f0f !important; border-color: #2b2b2b !important; color: #fafafa !important; }
      .email-bookmark-title { color: #fafafa !important; }
      .email-bookmark-description { color: #c7c7c7 !important; }
      .email-bookmark-meta { color: #8a8a8a !important; }
      .email-digest-date { color: #777 !important; }
      .email-digest-time { color: #777 !important; }
      .email-digest-content { border-color: #242424 !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #f7f7f5; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-family: ${SANS_FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f7f5;" class="email-body">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width: 540px; width: 100%; background-color: #ffffff; border: 1px solid rgba(10,10,10,0.08); border-radius: 18px;">
          ${content}
        </table>
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="max-width: 540px; width: 100%; margin-top: 16px;">
          <tr>
            <td align="center" style="padding: 0 12px;">
              <span class="email-soft" style="font-family: ${MONO_FONT}; font-size: 11px; color: #94949b; letter-spacing: 0;">&copy; 2023&ndash;2026 bunizao &middot; <a href="${escapeHtml(privacyUrl)}" class="email-link email-soft" style="color: #94949b; text-decoration: none;">Privacy</a></span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildBrandHeader(siteUrl: string): string {
  const safeSite = escapeHtml(siteUrl);
  const peekUrl = `${siteUrl.replace(/\/$/, '')}/logo/peek.svg`;
  return `
          <tr>
            <td style="padding: 28px 32px 0;">
              <a href="${safeSite}" class="email-link" style="display: inline-block; text-decoration: none; color: #0a0a0a;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="padding-right: 10px;">
                      <img src="${escapeHtml(peekUrl)}" alt="" width="32" height="24" style="display: block; width: 32px; height: 24px; border: 0;" />
                    </td>
                    <td valign="middle">
                      <span class="email-brand-text" style="font-family: ${MONO_FONT}; font-size: 14px; font-weight: 600; letter-spacing: 0; color: #0a0a0a;">bunizao</span>
                    </td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>`;
}

function pillButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" class="email-btn-pill" style="display: inline-block; font-family: ${SANS_FONT}; font-size: 14px; font-weight: 500; letter-spacing: -0.005em; color: #ffffff; background-color: #0a0a0a; text-decoration: none; padding: 12px 22px; border: 1px solid #0a0a0a; border-radius: 10px; -webkit-text-size-adjust: none;">
                <span class="email-btn-text" style="color: #ffffff; -webkit-text-fill-color: #ffffff;">${escapeHtml(label)}&nbsp;&rarr;</span>
              </a>`;
}

function eyebrowRow(text: string, variant: 'default' | 'error' | 'success' = 'default'): string {
  const dotClass = variant === 'error'
    ? 'email-status-dot email-status-dot--error'
    : variant === 'success'
      ? 'email-status-dot email-status-dot--success'
      : 'email-status-dot';
  const dotColor = variant === 'error'
    ? '#c44848'
    : variant === 'success'
      ? '#16a34a'
      : '#0a0a0a';
  return `
          <tr>
            <td style="padding: 32px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right: 8px;">
                    <span class="${dotClass}" style="display: inline-block; width: 6px; height: 6px; background-color: ${dotColor}; border-radius: 999px;"></span>
                  </td>
                  <td valign="middle">
                    <span class="email-eyebrow" style="font-family: ${MONO_FONT}; font-size: 11px; font-weight: 500; color: #6b6b6b; letter-spacing: 0.04em; text-transform: uppercase;">${escapeHtml(text)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

function titleRow(title: string): string {
  return `
          <tr>
            <td class="email-text" style="padding: 12px 32px 0; font-family: ${SANS_FONT}; font-size: 28px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.025em; line-height: 1.18;">
              ${escapeHtml(title)}
            </td>
          </tr>`;
}

export function buildSubscribeConfirmEmail(options: {
  siteUrl: string;
  confirmUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Confirm your mood subscription';
  const html = emailShell(`
          ${buildBrandHeader(options.siteUrl)}
          ${titleRow('Almost there.')}
          <tr>
            <td class="email-muted" style="padding: 14px 32px 0; font-family: ${SANS_FONT}; font-size: 15px; line-height: 1.65; color: #6b6b6b; max-width: 36ch;">
              One tap and mood updates start landing in this inbox. Do nothing and nothing happens.
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 0;">
              ${pillButton(options.confirmUrl, 'Confirm email')}
            </td>
          </tr>
          <tr>
            <td style="padding: 26px 32px 0;">
              <hr class="email-divider" style="border: none; border-top: 1px solid rgba(10,10,10,0.08); margin: 0;" />
            </td>
          </tr>
          <tr>
            <td class="email-soft" style="padding: 14px 32px 28px; font-family: ${SANS_FONT}; font-size: 12px; color: #94949b; line-height: 1.6;">
              Didn&rsquo;t ask for this? Ignore the email &mdash; the link expires on its own.
            </td>
          </tr>`, { siteUrl: options.siteUrl });

  const text = [
    'Almost there.',
    '',
    'One tap and mood updates start landing in this inbox. Do nothing and nothing happens.',
    '',
    `→ ${options.confirmUrl}`,
    '',
    'Didn\'t ask for this? Ignore the email — the link expires on its own.',
    '',
    `© 2023–2026 bunizao · ${options.siteUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export function buildSubscribeWelcomeEmail(options: {
  moodUrl: string;
  unsubscribeUrl: string;
  deliveryMode: 'immediate' | 'every_5h' | 'daily';
}): { subject: string; html: string; text: string } {
  const subject = 'Welcome aboard.';
  const modes: Array<{ key: 'immediate' | 'every_5h' | 'daily'; label: string }> = [
    { key: 'immediate', label: 'Real-time' },
    { key: 'every_5h', label: 'Every 5h' },
    { key: 'daily', label: 'Daily digest' },
  ];
  const activeLabel = modes.find((m) => m.key === options.deliveryMode)?.label ?? 'Real-time';
  const deliveryModeBody = options.deliveryMode === 'daily'
    ? 'You picked the daily digest. One bundle a day with everything that landed.'
    : options.deliveryMode === 'every_5h'
      ? 'You picked the 5-hour digest. New moods get bundled and sent every five hours.'
      : 'You picked real-time. New moods land in this inbox the moment they post.';
  const siteUrl = options.moodUrl.replace(/\/mood\/?.*$/, '').replace(/\/$/, '') || options.moodUrl;
  const settingsUrl = `${siteUrl}/mood?subscribe=1`;

  const segmentCells = modes
    .map((mode, index) => {
      const active = mode.key === options.deliveryMode;
      const isFirst = index === 0;
      const isLast = index === modes.length - 1;
      const radius = isFirst
        ? '999px 0 0 999px'
        : isLast
          ? '0 999px 999px 0'
          : '0';
      const borderLeft = isFirst ? 'border-left: 1px solid rgba(10,10,10,0.10);' : 'border-left: none;';
      const cellBg = active ? '#0a0a0a' : 'transparent';
      const cellBorderColor = active ? '#0a0a0a' : 'rgba(10,10,10,0.10)';
      const labelColor = active ? '#fafafa' : '#6b6b6b';
      const cellClass = active ? 'email-chip email-chip--active' : 'email-chip';
      return `
                  <td valign="middle" align="center" class="${cellClass}" style="padding: 8px 16px; ${borderLeft} border-top: 1px solid ${cellBorderColor}; border-right: 1px solid ${cellBorderColor}; border-bottom: 1px solid ${cellBorderColor}; border-radius: ${radius}; background-color: ${cellBg};">
                    <span class="email-chip-text" style="font-family: ${SANS_FONT}; font-size: 12px; font-weight: 500; color: ${labelColor}; letter-spacing: -0.005em; white-space: nowrap;">${escapeHtml(mode.label)}</span>
                  </td>`;
    })
    .join('');

  const html = emailShell(`
          ${buildBrandHeader(siteUrl)}
          ${eyebrowRow('Subscription confirmed', 'success')}
          ${titleRow('Congratulations!')}
          <tr>
            <td class="email-muted" style="padding: 14px 32px 0; font-family: ${SANS_FONT}; font-size: 15px; line-height: 1.65; color: #6b6b6b;">
              ${escapeHtml(deliveryModeBody)}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate;">
                <tr>${segmentCells}</tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 0;">
              ${pillButton(options.moodUrl, 'Open mood feed')}
            </td>
          </tr>
          <tr>
            <td style="padding: 26px 32px 0;">
              <hr class="email-divider" style="border: none; border-top: 1px solid rgba(10,10,10,0.08); margin: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 14px 32px 28px;">
              <a href="${escapeHtml(settingsUrl)}" class="email-link email-soft" style="font-family: ${SANS_FONT}; font-size: 12px; color: #94949b; text-decoration: none; margin-right: 14px;">Change frequency &rarr;</a>
              <a href="${escapeHtml(options.unsubscribeUrl)}" class="email-link email-soft" style="font-family: ${SANS_FONT}; font-size: 12px; color: #94949b; text-decoration: none;">Unsubscribe &rarr;</a>
            </td>
          </tr>`, { siteUrl });

  const text = [
    'Congratulations!',
    '',
    deliveryModeBody,
    `Mode: ${activeLabel}`,
    '',
    `Mood feed: ${options.moodUrl}`,
    `Change frequency: ${settingsUrl}`,
    `Unsubscribe: ${options.unsubscribeUrl}`,
    '',
    `© 2023–2026 bunizao · ${siteUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export function buildUnsubscribeNoticeEmail(options: {
  siteUrl: string;
  subscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Mood updates paused';
  const html = emailShell(`
          ${buildBrandHeader(options.siteUrl)}
          ${eyebrowRow('Quiet hours', 'error')}
          ${titleRow('Mood updates paused.')}
          <tr>
            <td class="email-muted" style="padding: 14px 32px 0; font-family: ${SANS_FONT}; font-size: 15px; line-height: 1.65; color: #6b6b6b; max-width: 36ch;">
              No more mood emails will land in this inbox. Changed your mind? Come back whenever.
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 0;">
              ${pillButton(options.subscribeUrl, 'Subscribe again')}
            </td>
          </tr>
          <tr>
            <td style="padding: 26px 32px 0;">
              <hr class="email-divider" style="border: none; border-top: 1px solid rgba(10,10,10,0.08); margin: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 14px 32px 28px;">
              <a href="${escapeHtml(options.siteUrl)}" class="email-link email-soft" style="font-family: ${SANS_FONT}; font-size: 12px; color: #94949b; text-decoration: none;">Back to site &rarr;</a>
            </td>
          </tr>`, { siteUrl: options.siteUrl });

  const text = [
    'Mood updates paused.',
    '',
    'No more mood emails will land in this inbox. Changed your mind? Come back whenever.',
    '',
    `Subscribe again: ${options.subscribeUrl}`,
    '',
    `© 2023–2026 bunizao · ${options.siteUrl}`,
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
  const hasBookmark = hasBookmarkPreview(options.previewHtml);
  const relatedLinksHtml = hasBookmark ? '' : buildRelatedLinksHtml(options.relatedLinks, { maxCount: 6 });
  const relatedLinksTextLines = hasBookmark ? [] : buildRelatedLinksTextLines(options.relatedLinks, { maxCount: 6 });
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
    const hasBookmark = hasBookmarkPreview(post.previewHtml);
    const richPreview = renderEmailRichPreview(post.previewHtml, true);
    const relatedLinksHtml = hasBookmark ? '' : buildRelatedLinksHtml(post.relatedLinks, { maxCount: 4, compact: true });
    const previewHtml = richPreview
      ? richPreview
      : `<a href="${escapeHtml(post.moodUrl)}" class="email-preview" style="display: block; font-family: ${MONO_FONT}; font-size: 13px; line-height: 1.65; color: #111; text-decoration: none;">
                            ${escapeHtmlWithLineBreaks(trimPreview(post.previewText, 160))}
                          </a>`;

    if (post.dateLabel && post.dateLabel !== currentDate) {
      currentDate = post.dateLabel;
      rows.push(`
                <tr>
                  <td class="email-digest-date" style="padding: 16px 14px 4px; font-family: ${MONO_FONT}; font-size: 10px; font-weight: 600; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase; color: #777;">
                    ${escapeHtml(post.dateLabel)}
                  </td>
                </tr>`);
    }

    rows.push(`
                <tr>
                  <td style="padding: 0 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-digest-item">
                      <tr>
                        <td valign="top" width="54" class="email-digest-time" style="padding: 9px 0 11px; font-family: ${MONO_FONT}; font-size: 10px; line-height: 1.4; color: #888; white-space: nowrap;">
                          ${escapeHtml(post.timeLabel)}
                        </td>
                        <td valign="top" class="email-digest-content" style="padding: 9px 0 11px 12px; border-left: 1px solid #ececec;">
                          ${previewHtml}
                          ${relatedLinksHtml}
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
    textLines.push(`Post: ${post.moodUrl}`);
    textLines.push('');
  }

  textLines.push(`Feed: ${options.moodUrl}`);
  textLines.push(`Unsubscribe: ${options.unsubscribeUrl}`);

  return { subject, html, text: textLines.join('\n') };
}
