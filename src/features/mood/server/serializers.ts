import * as cheerio from 'cheerio';
import type { ContentChannelSummary } from '@bunizao/contracts';
import type { MoodFeedItem, MoodFeedResponse } from '@/features/mood/server/contracts';
import { renderStructuredMoodFeedMediaMarkup } from '@/features/mood/shared/feed-media';

const stripInvalidXmlChars = (value: string): string =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

const escapeXml = (value: string): string => {
  const cleaned = stripInvalidXmlChars(value);
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const wrapCdata = (value: string): string => {
  const cleaned = stripInvalidXmlChars(value);
  return `<![CDATA[${cleaned.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
};

const truncateText = (value: string, maxLength: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}...`;
};

const toAbsoluteUrl = (value: string, base: URL): string => {
  if (!value) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('#')) return value;
  return new URL(value, base).href;
};

const toAbsoluteSrcset = (value: string, base: URL): string => {
  return value
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      const [urlPart, ...rest] = trimmed.split(/\s+/);
      if (!urlPart) return '';
      const absoluteUrl = toAbsoluteUrl(urlPart, base);
      return [absoluteUrl, ...rest].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(', ');
};

const absolutizeHtml = (html: string, base: URL): string => {
  if (!html) return '';
  const $ = cheerio.load(html);
  const updateAttr = (selector: string, attr: string, mapper: (value: string) => string) => {
    $(selector).each((_index, el) => {
      const current = $(el).attr(attr);
      if (!current) return;
      const next = mapper(current);
      if (next && next !== current) {
        $(el).attr(attr, next);
      }
    });
  };

  updateAttr('a', 'href', (value) => toAbsoluteUrl(value, base));
  updateAttr('img', 'src', (value) => toAbsoluteUrl(value, base));
  updateAttr('img', 'srcset', (value) => toAbsoluteSrcset(value, base));
  updateAttr('video', 'src', (value) => toAbsoluteUrl(value, base));
  updateAttr('video', 'poster', (value) => toAbsoluteUrl(value, base));
  updateAttr('audio', 'src', (value) => toAbsoluteUrl(value, base));
  updateAttr('source', 'src', (value) => toAbsoluteUrl(value, base));
  updateAttr('track', 'src', (value) => toAbsoluteUrl(value, base));

  return $.root().html() ?? html;
};

// Extract the decoded `src` of every <img> already present in the serialized
// content. Comparing collected images against this set (rather than a raw
// substring of the HTML) is escape-aware — cheerio decodes `&amp;` back to `&`
// so query-param URLs dedup correctly — and delimiter-bounded, so `/mood/1/0`
// never suppresses `/mood/1/00`.
const collectEmbeddedImageSrcs = (html: string): Set<string> => {
  const srcs = new Set<string>();
  if (!html) return srcs;
  const $ = cheerio.load(html);
  $('img').each((_index, el) => {
    const src = $(el).attr('src');
    if (src) srcs.add(src);
  });
  return srcs;
};

const buildRssImageTag = (
  src: string,
  base: URL,
  width?: number | null,
  height?: number | null,
  alt?: string,
): string => {
  const absoluteSrc = toAbsoluteUrl(src, base);
  const attrs = [`src="${escapeXml(absoluteSrc)}"`];
  if (typeof width === 'number' && width > 0) attrs.push(`width="${width}"`);
  if (typeof height === 'number' && height > 0) attrs.push(`height="${height}"`);
  attrs.push(`alt="${escapeXml(alt ?? '')}"`);
  return `<img ${attrs.join(' ')} />`;
};

// The structured feed-media renderer intentionally drops image/sticker items
// (the feed page renders those via the gallery/thumb path). RSS has no such
// path, so emit image markup here from the same MoodFeedItem fields. Each entry
// carries its absolute src so callers can guard against duplicating an image
// the preview HTML already embeds.
const collectRssImages = (post: MoodFeedItem, base: URL): { src: string; tag: string }[] => {
  if (post.gallery?.items.length) {
    return post.gallery.items
      .filter((item) => Boolean(item.src))
      .map((item) => ({
        src: toAbsoluteUrl(item.src, base),
        tag: buildRssImageTag(item.src, base, item.width, item.height, item.alt),
      }));
  }

  if (post.image) {
    return [{
      src: toAbsoluteUrl(post.image, base),
      tag: buildRssImageTag(post.image, base, post.imageWidth, post.imageHeight),
    }];
  }

  return [];
};



export function buildMoodRssXml(
  channel: ContentChannelSummary,
  posts: MoodFeedItem[],
  baseUrl: URL
): string {
  const channelTitle = channel.title?.trim() || 'Moods';
  const channelDescription =
    channel.description?.trim() || 'Thoughts and moments from my Telegram channel.';
  const channelUrl = new URL('/mood', baseUrl);
  const selfUrl = new URL('/mood/rss.xml', baseUrl);
  const channelLink = channelUrl.href;
  const selfLink = selfUrl.href;
  const latestDate = posts[0]?.datetime;
  const lastBuildDate = latestDate && !Number.isNaN(new Date(latestDate).getTime())
    ? new Date(latestDate).toUTCString()
    : new Date().toUTCString();

  const items = posts.map((post) => {
    const title = truncateText(post.previewText || '', 120)
      || `Mood ${post.id}`;
    const summary = truncateText(post.previewText || '', 220);
    const itemUrl = new URL(`/mood/${post.id}`, baseUrl);
    const link = itemUrl.href;
    const pubDate = new Date(post.datetime);
    const pubDateText = Number.isNaN(pubDate.getTime()) ? '' : pubDate.toUTCString();
    const structuredMediaHtml = renderStructuredMoodFeedMediaMarkup(post.media);
    const baseContent = absolutizeHtml(
      [post.previewHtml, structuredMediaHtml || post.mediaHtml].filter(Boolean).join('\n'),
      baseUrl
    );
    // Append image markup the structured renderer omits, skipping any image the
    // preview HTML already embeds so single-image posts stay deduplicated. Match
    // against the parsed <img> src attributes so escaped query-param URLs and
    // id-prefixed paths dedup correctly.
    const embeddedImageSrcs = collectEmbeddedImageSrcs(baseContent);
    const extraImages = collectRssImages(post, baseUrl)
      .filter(({ src }) => !embeddedImageSrcs.has(src))
      .map(({ tag }) => tag);
    const content = [baseContent, ...extraImages].filter(Boolean).join('\n');
    const categories = [post.tag]
      .map((tag) => tag?.trim() ?? '')
      .filter(Boolean)
      .map((tag) => `<category>${escapeXml(tag)}</category>`)
      .join('\n        ');

    const parts = [
      `<title>${escapeXml(title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid isPermaLink="true">${escapeXml(link)}</guid>`,
      pubDateText ? `<pubDate>${escapeXml(pubDateText)}</pubDate>` : '',
      summary ? `<description>${escapeXml(summary)}</description>` : '',
      content ? `<content:encoded>${wrapCdata(content)}</content:encoded>` : '',
      categories,
    ]
      .filter(Boolean)
      .join('\n        ');

    return `      <item>
        ${parts}
      </item>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    `    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(selfLink)}" rel="self" type="application/rss+xml" />`,
    '    <language>en</language>',
    items.join('\n'),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

function normalizeMarkdownText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function appendBlockquote(lines: string[], value: string, label = 'Text'): void {
  const normalized = normalizeMarkdownText(value);
  if (!normalized) return;

  lines.push(`${label}:`);
  for (const line of normalized.split('\n')) {
    lines.push(line ? `> ${line}` : '>');
  }
}

function formatReaction(reaction: MoodFeedItem['reactions'][number]): string {
  return `${reaction.emoji} ${reaction.count}`;
}

function formatMediaItem(
  type: string,
  src: string,
  baseUrl: URL,
  width?: number | null,
  height?: number | null
): string {
  const parts = [`- ${type}: ${toAbsoluteUrl(src, baseUrl)}`];
  if (width && height) {
    parts.push(`(${width}x${height})`);
  }
  return parts.join(' ');
}

function appendMedia(lines: string[], post: MoodFeedItem, baseUrl: URL): void {
  const mediaLines: string[] = [];

  if (post.gallery?.items.length) {
    for (const item of post.gallery.items) {
      mediaLines.push(formatMediaItem('image', item.src, baseUrl, item.width, item.height));
    }
  } else if (post.image) {
    mediaLines.push(formatMediaItem('image', post.image, baseUrl, post.imageWidth, post.imageHeight));
  }

  if (post.imageFallback && post.imageFallback !== post.image) {
    mediaLines.push(`- image fallback: ${toAbsoluteUrl(post.imageFallback, baseUrl)}`);
  }

  if (!mediaLines.length && post.previewMediaType) {
    mediaLines.push(`- ${post.previewMediaType}`);
  }

  if (!mediaLines.length) return;

  lines.push('Media:');
  lines.push(...mediaLines);
}

function appendQuote(lines: string[], post: MoodFeedItem, baseUrl: URL): void {
  if (!post.quote) return;

  const quoteParts = ['Quote:'];
  if (post.quote.author) {
    quoteParts.push(post.quote.author);
  }
  if (post.quote.href) {
    quoteParts.push(toAbsoluteUrl(post.quote.href, baseUrl));
  }
  lines.push(quoteParts.join(' '));
  appendBlockquote(lines, post.quote.text, 'Quote text');
  if (post.quote.thumbnailSrc) {
    lines.push(`Quote media: ${toAbsoluteUrl(post.quote.thumbnailSrc, baseUrl)}`);
  }
}

export function buildMoodAgentPostMarkdown(
  post: MoodFeedItem,
  baseUrl: URL,
  options: { headingLevel?: 1 | 2 } = {}
): string {
  const heading = '#'.repeat(options.headingLevel ?? 2);
  const lines = [
    `${heading} ${post.id} · ${post.datetime}`,
    '',
    `URL: ${new URL(`/mood/${post.id}`, baseUrl).href}`,
  ];

  if (post.tag) {
    lines.push(`Tag: ${post.tag}`);
  }

  const commentsCount = String(post.commentsCount || '').trim();
  if (commentsCount && commentsCount !== '0') {
    lines.push(`Comments: ${commentsCount}`);
  }

  if (post.reactions.length) {
    lines.push(`Reactions: ${post.reactions.map(formatReaction).join(', ')}`);
  }

  if (post.forwardedFrom?.name) {
    const forwardedFrom = post.forwardedFrom.href
      ? `${post.forwardedFrom.name} (${toAbsoluteUrl(post.forwardedFrom.href, baseUrl)})`
      : post.forwardedFrom.name;
    lines.push(`Forwarded from: ${forwardedFrom}`);
  }

  lines.push('');
  appendBlockquote(lines, post.previewText);
  appendQuote(lines, post, baseUrl);
  appendMedia(lines, post, baseUrl);

  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').trim();
}

export function buildMoodAgentMarkdown(
  feed: MoodFeedResponse,
  baseUrl: URL,
  options: {
    before?: string;
    after?: string;
  } = {}
): string {
  const sourceUrl = new URL('/mood', baseUrl);
  const jsonUrl = new URL('/api/moods', baseUrl);
  if (options.before) {
    jsonUrl.searchParams.set('before', options.before);
  }
  if (options.after) {
    jsonUrl.searchParams.set('after', options.after);
  }

  const lines = [
    '# Mood Feed',
    '',
    `Source: ${sourceUrl.href}`,
    `JSON: ${jsonUrl.href}`,
  ];

  const latestId = feed.posts[0]?.id ?? '';
  if (latestId) {
    lines.push(`Latest: ${latestId}`);
  }

  const nextBefore = feed.posts.at(-1)?.id ?? '';
  if (nextBefore) {
    const nextUrl = new URL('/mood', baseUrl);
    nextUrl.searchParams.set('before', nextBefore);
    lines.push(`Next: ${nextUrl.href}`);
  }

  if (feed.channel.title) {
    lines.push(`Channel: ${feed.channel.title}`);
  }

  lines.push('');

  if (!feed.posts.length) {
    lines.push('No mood posts found.');
    return `${lines.join('\n')}\n`;
  }

  lines.push(...feed.posts.map((post) => buildMoodAgentPostMarkdown(post, baseUrl)).join('\n\n').split('\n'));

  return `${lines.join('\n')}\n`;
}

export function buildMoodAgentPostPageMarkdown(
  post: MoodFeedItem,
  baseUrl: URL
): string {
  const feedUrl = new URL('/mood', baseUrl);
  return [
    buildMoodAgentPostMarkdown(post, baseUrl, { headingLevel: 1 }),
    '',
    `Feed: ${feedUrl.href}`,
    '',
  ].join('\n');
}
