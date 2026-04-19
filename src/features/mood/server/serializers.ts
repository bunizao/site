import * as cheerio from 'cheerio';
import { getTextPreview } from '@/features/mood/shared/utils';
import type { ChannelInfo, Post } from '@/features/mood/server/telegram-source';

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
  const $ = cheerio.load(html, { decodeEntities: false });
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

export function buildMoodRssXml(channel: ChannelInfo, posts: Post[], baseUrl: URL): string {
  const channelTitle = channel.title?.trim() || 'Moods';
  const channelDescription =
    channel.description?.trim() || 'Thoughts and moments from my Telegram channel.';
  const channelLink = new URL('/mood', baseUrl).href;
  const selfLink = new URL('/mood/rss.xml', baseUrl).href;
  const latestDate = posts[0]?.datetime;
  const lastBuildDate = latestDate && !Number.isNaN(new Date(latestDate).getTime())
    ? new Date(latestDate).toUTCString()
    : new Date().toUTCString();

  const items = posts.map((post) => {
    const title = post.title?.trim()
      || truncateText(post.text || '', 120)
      || `Mood ${post.id}`;
    const summary = truncateText(
      getTextPreview({ text: post.text, content: post.content }) || post.text || '',
      220
    );
    const link = new URL(`/mood/${post.id}`, baseUrl).href;
    const pubDate = new Date(post.datetime);
    const pubDateText = Number.isNaN(pubDate.getTime()) ? '' : pubDate.toUTCString();
    const content = absolutizeHtml(post.content, baseUrl);
    const categories = (post.tags ?? [])
      .map((tag) => tag.trim())
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
