import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

import { blog } from '@/data/site';
import { getTagLabel } from '@/features/posts/display';
import { formatPostDate, postPath, tagPath } from '@/features/posts/format';
import type { Post, Tag, TagDirectoryEntry } from '@/features/posts/types';

type LoadedCheerio = ReturnType<typeof cheerio.load>;

function toAbsoluteUrl(value: string, baseUrl: URL): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return new URL(trimmed, baseUrl).href;
}

function normalizeInline(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function renderInlineCodeText(value: string): string {
  const body = value.trim();
  if (!body) return '';

  const backtickRuns = body.match(/`+/g) ?? [];
  const longestRun = backtickRuns.reduce((max, run) => Math.max(max, run.length), 0);
  const delimiter = '`'.repeat(longestRun + 1);
  const needsPadding = body.startsWith('`') || body.endsWith('`');
  const content = needsPadding ? ` ${body} ` : body;

  return `${delimiter}${content}${delimiter}`;
}

function trimMarkdown(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderInline($: LoadedCheerio, nodes: cheerio.Cheerio<AnyNode>, baseUrl: URL): string {
  const parts: string[] = [];

  for (const node of nodes.toArray()) {
    if (node.type === 'text') {
      parts.push((node as { data?: string }).data ?? '');
      continue;
    }

    if (node.type !== 'tag') continue;

    const element = $(node);
    const tagName = (node as { name?: string }).name?.toLowerCase() ?? '';
    const text = () => renderInline($, element.contents(), baseUrl);

    if (tagName === 'br') {
      parts.push('\n');
    } else if (tagName === 'strong' || tagName === 'b') {
      const body = normalizeInline(text());
      if (body) parts.push(`**${body}**`);
    } else if (tagName === 'em' || tagName === 'i') {
      const body = normalizeInline(text());
      if (body) parts.push(`*${body}*`);
    } else if (tagName === 'code') {
      const body = renderInlineCodeText(element.text());
      if (body) parts.push(body);
    } else if (tagName === 'a') {
      const body = normalizeInline(text()) || normalizeInline(element.text());
      const href = element.attr('href');
      if (body && href) parts.push(`[${body}](${toAbsoluteUrl(href, baseUrl)})`);
      else if (body) parts.push(body);
    } else if (tagName === 'img') {
      const src = element.attr('src');
      if (src) {
        const alt = normalizeInline(element.attr('alt') ?? '');
        parts.push(`![${alt}](${toAbsoluteUrl(src, baseUrl)})`);
      }
    } else {
      parts.push(text());
    }
  }

  return normalizeInline(parts.join(''));
}

function renderCodeFence(element: cheerio.Cheerio<AnyNode>): string {
  const code = element.find('code').first();
  const className = code.attr('class') ?? '';
  const language = className.match(/language-([a-z0-9_-]+)/i)?.[1] ?? '';
  const body = (code.length ? code.text() : element.text()).replace(/\n+$/, '');

  return [`\`\`\`${language}`, body, '```'].join('\n');
}

function renderBookmarkCard(
  element: cheerio.Cheerio<AnyNode>,
  baseUrl: URL,
): string[] {
  const link = element.find('a[href]').first();
  const href = link.attr('href')?.trim();
  const title = normalizeInline(element.find('.kg-bookmark-title').first().text());

  if (!href) return title ? [title] : [];

  const label = title || href;
  return [`[${label}](${toAbsoluteUrl(href, baseUrl)})`];
}

function renderBlockNode($: LoadedCheerio, node: AnyNode, baseUrl: URL): string[] {
  if (node.type === 'text') {
    const text = normalizeInline((node as { data?: string }).data ?? '');
    return text ? [text] : [];
  }

  if (node.type !== 'tag') return [];

  const element = $(node);
  const tagName = (node as { name?: string }).name?.toLowerCase() ?? '';

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1));
    const heading = renderInline($, element.contents(), baseUrl);
    return heading ? [`${'#'.repeat(level)} ${heading}`] : [];
  }

  if (tagName === 'p') {
    const paragraph = renderInline($, element.contents(), baseUrl);
    return paragraph ? [paragraph] : [];
  }

  if (tagName === 'pre') {
    return [renderCodeFence(element)];
  }

  if (tagName === 'blockquote') {
    const body = element
      .contents()
      .toArray()
      .flatMap((child) => renderBlockNode($, child, baseUrl))
      .join('\n\n');
    return body
      ? [body.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n')]
      : [];
  }

  if (tagName === 'ul' || tagName === 'ol') {
    const ordered = tagName === 'ol';
    const lines = element.children('li').toArray().flatMap((li, index) => {
      const item = normalizeInline(renderInline($, $(li).contents(), baseUrl));
      if (!item) return [];
      const marker = ordered ? `${index + 1}.` : '-';
      return [`${marker} ${item}`];
    });
    return lines.length ? [lines.join('\n')] : [];
  }

  if (tagName === 'hr') {
    return ['---'];
  }

  if (tagName === 'figure') {
    if (element.hasClass('kg-bookmark-card')) {
      return renderBookmarkCard(element, baseUrl);
    }

    const body = element
      .contents()
      .toArray()
      .flatMap((child) => renderBlockNode($, child, baseUrl))
      .join('\n\n');
    return body ? [body] : [];
  }

  if (tagName === 'iframe') {
    const src = element.attr('src');
    return src ? [`[Embedded content](${toAbsoluteUrl(src, baseUrl)})`] : [];
  }

  const childBlocks = element
    .contents()
    .toArray()
    .flatMap((child) => renderBlockNode($, child, baseUrl));

  if (childBlocks.length) return childBlocks;

  const inline = renderInline($, element.contents(), baseUrl);
  return inline ? [inline] : [];
}

function htmlToMarkdown(html: string, baseUrl: URL): string {
  if (!html.trim()) return '';

  const $ = cheerio.load(html);
  const blocks = $('body')
    .contents()
    .toArray()
    .flatMap((node) => renderBlockNode($, node, baseUrl));

  return trimMarkdown(blocks.join('\n\n'));
}

function absolutizeMarkdownLinks(markdown: string, baseUrl: URL): string {
  return markdown.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (_match, prefix: string, url: string, suffix: string) => {
    return `${prefix}${toAbsoluteUrl(url, baseUrl)}${suffix}`;
  });
}

function postCanonicalUrl(post: Pick<Post, 'slug' | 'canonicalUrl'>, baseUrl: URL): string {
  return post.canonicalUrl?.trim() || new URL(postPath(post.slug), baseUrl).href;
}

export function buildPostAgentMarkdown(post: Post, baseUrl: URL): string {
  const body = post.markdown?.trim()
    ? absolutizeMarkdownLinks(post.markdown, baseUrl)
    : htmlToMarkdown(post.html, baseUrl);
  const author = post.primaryAuthor?.name ?? blog.author.name;
  const tags = post.tags
    .filter((tag) => tag.visibility === 'public')
    .map((tag) => tag.name)
    .join(', ');
  const lines = [
    `# ${post.title}`,
    '',
    `By: ${author}`,
    `Published: ${formatPostDate(post.publishedAt)}`,
    `Canonical: ${postCanonicalUrl(post, baseUrl)}`,
  ];

  if (post.updatedAt && post.updatedAt !== post.publishedAt) {
    lines.push(`Updated: ${formatPostDate(post.updatedAt)}`);
  }
  if (tags) {
    lines.push(`Tags: ${tags}`);
  }
  if (post.excerpt) {
    lines.push('', post.excerpt);
  }
  if (body) {
    lines.push('', body);
  }

  return `${trimMarkdown(lines.join('\n'))}\n`;
}

export function buildPostListAgentMarkdown(title: string, posts: Post[], baseUrl: URL): string {
  const lines = [
    `# ${title}`,
    '',
    ...posts.map((post) => `- ${formatPostDate(post.publishedAt)} · [${post.title}](${new URL(postPath(post.slug), baseUrl).href})`),
  ];

  return `${trimMarkdown(lines.join('\n'))}\n`;
}

export function buildTagDirectoryAgentMarkdown(tags: TagDirectoryEntry[], baseUrl: URL): string {
  const lines = [
    '# Blog Tags',
    '',
    ...tags.map((tag) => {
      const label = getTagLabel(tag, blog.locale.blog);
      return `- [${label}](${new URL(tagPath(tag.slug), baseUrl).href}) · ${tag.posts.length} ${tag.posts.length === 1 ? 'post' : 'posts'}`;
    }),
  ];

  return `${trimMarkdown(lines.join('\n'))}\n`;
}

export function buildTagArchiveAgentMarkdown(
  tag: Tag,
  posts: Post[],
  baseUrl: URL,
): string {
  return buildPostListAgentMarkdown(`Blog Tag: ${getTagLabel(tag, blog.locale.blog)}`, posts, baseUrl);
}
