import { $fetch } from 'ofetch';
import * as cheerio from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import { LRUCache } from 'lru-cache';
import flourite from 'flourite';
import Prism from 'prismjs';

// Import Prism language components
import 'prismjs-components-importer/cjs/prism-c';
import 'prismjs-components-importer/cjs/prism-clojure';
import 'prismjs-components-importer/cjs/prism-cpp';
import 'prismjs-components-importer/cjs/prism-csharp';
import 'prismjs-components-importer/cjs/prism-css';
import 'prismjs-components-importer/cjs/prism-dart';
import 'prismjs-components-importer/cjs/prism-docker';
import 'prismjs-components-importer/cjs/prism-elixir';
import 'prismjs-components-importer/cjs/prism-go';
import 'prismjs-components-importer/cjs/prism-markup';
import 'prismjs-components-importer/cjs/prism-java';
import 'prismjs-components-importer/cjs/prism-javascript';
import 'prismjs-components-importer/cjs/prism-json';
import 'prismjs-components-importer/cjs/prism-julia';
import 'prismjs-components-importer/cjs/prism-kotlin';
import 'prismjs-components-importer/cjs/prism-lua';
import 'prismjs-components-importer/cjs/prism-markdown';
import 'prismjs-components-importer/cjs/prism-pascal';
import 'prismjs-components-importer/cjs/prism-php';
import 'prismjs-components-importer/cjs/prism-python';
import 'prismjs-components-importer/cjs/prism-ruby';
import 'prismjs-components-importer/cjs/prism-rust';
import 'prismjs-components-importer/cjs/prism-sql';
import 'prismjs-components-importer/cjs/prism-typescript';
import 'prismjs-components-importer/cjs/prism-yaml';

// Types
export interface Reaction {
  emoji: string;
  emojiId?: string;
  emojiImage?: string;
  count: string;
  isPaid: boolean;
}

export interface ForwardedFrom {
  name: string;
  href?: string;
  author?: string;
}

export interface Comment {
  id: string;
  author: string;
  authorAvatar?: string;
  datetime: string;
  content: string;
  reactions: Reaction[];
}

export interface Post {
  id: string;
  title: string;
  type: 'text' | 'service';
  datetime: string;
  tags: string[];
  text: string;
  content: string;
  forwardedFrom?: ForwardedFrom;
  reactions: Reaction[];
  comments?: Comment[];
  commentsCount?: number;
}

export interface ChannelInfo {
  posts: Post[];
  title: string;
  titleHTML: string;
  description: string;
  descriptionHTML: string;
  avatar: string;
}

interface ContentProcessorConfig {
  staticProxy: string;
  id?: string;
  index?: number;
  title?: string;
  channel?: string;
  channelTitle?: string;
  host?: string;
  headers?: Record<string, string>;
}

function escapeHtml(value: string = ''): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

// HD image proxy URL (Cloudflare Worker)
const HD_IMAGE_URL = import.meta.env.PUBLIC_HD_IMAGE_URL || '';

/**
 * Upgrade image URL to higher quality by modifying the width parameter
 * Note: This is now a fallback - HD images come from the Worker proxy
 */
function upgradeImageQuality(url: string): string {
  if (!url) return url;
  // Remove existing width parameter and add higher quality one
  // Telegram CDN supports ?w= parameter for width
  const cleanUrl = url.replace(/[?&]w=\d+/g, '');
  const separator = cleanUrl.includes('?') ? '&' : '?';
  // Request 1280px width for better quality on desktop
  return `${cleanUrl}${separator}w=1280`;
}

function normalizeMediaUrl(value: string): string {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  return value;
}

function toStaticProxyUrl(value: string, staticProxy: string): string {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return '';
  // Check if already proxied (starts with /static/ or contains /static/https:)
  if (normalized.startsWith(staticProxy) || normalized.includes('/static/https:')) return normalized;
  if (/^(data:|blob:)/i.test(normalized)) return normalized;
  if (/^https?:/i.test(normalized)) return `${staticProxy}${normalized}`;
  return normalized;
}

function extractBackgroundImage(style: string): string {
  if (!style) return '';
  const match = style.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ?? '';
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const trimmed = value.slice(0, maxLength).trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  const truncated = lastSpace > Math.floor(maxLength * 0.6) ? trimmed.slice(0, lastSpace) : trimmed;
  return `${truncated}...`;
}

// LRU Cache for Telegram API responses
const cache = new LRUCache<string, ChannelInfo | Post>({
  ttl: 1000 * 60 * 5, // 5 minutes
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (item) => {
    return JSON.stringify(item).length;
  },
});

const commentsCountCache = new LRUCache<string, number>({
  ttl: 1000 * 60 * 10, // 10 minutes
  max: 1000,
});

// Helper function to get environment variables
function getEnv(env: ImportMetaEnv, Astro: any, name: string): string {
  return env[name] ?? Astro.locals?.runtime?.env?.[name] ?? '';
}

// Content processors
function getVideoStickers($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  return $(item)
    .find('.js-videosticker_video')
    ?.map((_index, video) => {
      const url = $(video)?.attr('src');
      const imgurl = $(video).find('img')?.attr('src');
      return `
    <div style="background-image: none; width: 256px;">
      <video src="${staticProxy + url}" width="100%" height="100%" alt="Video Sticker" preload muted autoplay loop playsinline disablepictureinpicture >
        <img class="sticker" src="${staticProxy + imgurl}" alt="Video Sticker" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}" />
      </video>
    </div>
    `;
    })
    ?.get()
    ?.join('') ?? '';
}

function getImageStickers($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  return $(item)
    .find('.tgme_widget_message_sticker')
    ?.map((_index, image) => {
      const url = $(image)?.attr('data-webp');
      return `<img class="sticker" src="${staticProxy + url}" style="width: 256px;" alt="Sticker" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}" />`;
    })
    ?.get()
    ?.join('') ?? '';
}

function getImages($: CheerioAPI, item: Element, { staticProxy, id, index, title }: ContentProcessorConfig): string {
  const images = $(item)
    .find('.tgme_widget_message_photo_wrap')
    ?.map((_index, photo) => {
      const style = $(photo).attr('style') ?? '';
      const url = style.match(/url\(["'](.*?)["']/)?.[1];
      // Upgrade to higher quality image (fallback)
      const highQualityUrl = upgradeImageQuality(url ?? '');
      const fallbackUrl = staticProxy + highQualityUrl;

      // Use HD Worker proxy if configured, with fallback to static proxy
      const hdUrl = HD_IMAGE_URL && id ? `${HD_IMAGE_URL}/mood/${id}/${_index}` : '';
      const imgSrc = hdUrl || fallbackUrl;

      const widthMatch = style.match(/width:\s*(\d+)px/i);
      const heightMatch = style.match(/height:\s*(\d+)px/i);
      // Telegram uses padding-top percentage for aspect ratio (height/width * 100)
      const paddingMatch = style.match(/padding-top:\s*([\d.]+)%/i);
      const imageWidth = widthMatch ? Number.parseInt(widthMatch[1], 10) : 0;
      let imageHeight = heightMatch ? Number.parseInt(heightMatch[1], 10) : 0;
      // Calculate height from padding-top if not directly available
      if (!imageHeight && paddingMatch && imageWidth) {
        const paddingPercent = Number.parseFloat(paddingMatch[1]);
        imageHeight = Math.round(imageWidth * paddingPercent / 100);
      }
      // Detect portrait (vertical) images: height > width * 1.2
      // Detect ultra-tall images: height > width * 2.5
      const isPortrait = imageHeight > 0 && imageHeight > imageWidth * 1.2;
      const isUltraTall = imageHeight > 0 && imageHeight > imageWidth * 2.5;
      const portraitClass = isUltraTall ? ' image-preview-wrap--ultra-tall' : isPortrait ? ' image-preview-wrap--portrait' : '';
      const widthStyle = imageWidth ? ` style="--image-width:${imageWidth}px;--image-height:${imageHeight}px"` : '';
      const widthAttr = imageWidth ? ` width="${imageWidth}"` : '';
      const heightAttr = imageHeight ? ` height="${imageHeight}"` : '';
      const popoverId = `modal-${id}-${_index}`;

      // onerror fallback to static proxy if HD Worker fails
      const onerrorAttr = hdUrl ? ` onerror="this.onerror=null;this.src='${fallbackUrl}'"` : '';

      return `
      <button class="image-preview-button image-preview-wrap${portraitClass}" popovertarget="${popoverId}" popovertargetaction="show"${widthStyle}>
        <img src="${imgSrc}"${onerrorAttr} alt="${title}" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}"${widthAttr}${heightAttr} />
      </button>
      <button class="image-preview-button modal" id="${popoverId}" popovertarget="${popoverId}" popovertargetaction="hide" popover>
        <img class="modal-img" src="${imgSrc}"${onerrorAttr} alt="${title}" loading="lazy" />
      </button>
    `;
    })
    ?.get() ?? [];
  return images.length ? `<div class="image-list-container ${images.length % 2 === 0 ? 'image-list-even' : 'image-list-odd'}">${images?.join('')}</div>` : '';
}

function getVideo($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  const htmlParts: string[] = [];

  const applyVideoAttributes = (videoEl: cheerio.Cheerio<Element>, contextEl: cheerio.Cheerio<Element>): void => {
    const src = videoEl.attr('src');
    if (src) {
      videoEl.attr('src', toStaticProxyUrl(src, staticProxy));
    }

    videoEl.find('source').each((_sourceIndex, source) => {
      const sourceEl = $(source);
      const sourceSrc = sourceEl.attr('src');
      if (sourceSrc) {
        sourceEl.attr('src', toStaticProxyUrl(sourceSrc, staticProxy));
      }
    });

    const explicitPoster = videoEl.attr('poster') ?? '';
    const dataPoster = videoEl.attr('data-poster') ?? videoEl.attr('data-thumb') ?? '';
    const wrapPoster = extractBackgroundImage(contextEl.attr('style') ?? '');
    const wrapDataPoster = contextEl.attr('data-poster') ?? contextEl.attr('data-thumb') ?? '';
    const nestedPoster = contextEl
      .find('.tgme_widget_message_video_thumb, .tgme_widget_message_roundvideo_thumb, [style*="background-image"]')
      .map((_index, node) => extractBackgroundImage($(node).attr('style') ?? ''))
      .get()
      .find((value) => Boolean(value)) ?? '';
    const poster = explicitPoster || dataPoster || wrapDataPoster || nestedPoster || wrapPoster;
    if (poster) {
      const posterUrl = toStaticProxyUrl(poster, staticProxy);
      videoEl.attr('poster', posterUrl);
      const safePoster = posterUrl.replace(/'/g, '%27');
      const existingStyle = videoEl.attr('style') ?? '';
      const backgroundStyle = `background-image: url('${safePoster}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
      videoEl.attr('style', existingStyle ? `${existingStyle}; ${backgroundStyle}` : backgroundStyle);
    }

    videoEl
      .attr('controls', 'true')
      .attr('preload', (index ?? 0) > 15 ? 'auto' : 'metadata')
      .attr('playsinline', 'true')
      .attr('webkit-playsinline', 'true');
  };

  const resolvePosterContext = (wrapEl: cheerio.Cheerio<Element>): cheerio.Cheerio<Element> => {
    const player = wrapEl.closest('.tgme_widget_message_video_player, .tgme_widget_message_roundvideo_player');
    return player.length ? player : wrapEl;
  };

  $(item)
    .find('.tgme_widget_message_video_wrap')
    .each((_index, wrap) => {
      const wrapEl = $(wrap);
      const contextEl = resolvePosterContext(wrapEl);
      wrapEl.find('video').each((_videoIndex, video) => {
        const videoEl = $(video);
        applyVideoAttributes(videoEl, contextEl);
        htmlParts.push($.html(videoEl));
      });
    });

  $(item)
    .find('.tgme_widget_message_roundvideo_wrap')
    .each((_index, wrap) => {
      const wrapEl = $(wrap);
      const contextEl = resolvePosterContext(wrapEl);
      wrapEl.find('video').each((_videoIndex, video) => {
        const videoEl = $(video);
        applyVideoAttributes(videoEl, contextEl);
        htmlParts.push($.html(videoEl));
      });
    });

  return htmlParts.join('');
}

function getAudio($: CheerioAPI, item: Element, { staticProxy }: ContentProcessorConfig): string {
  const audio = $(item).find('.tgme_widget_message_voice');
  if (audio.length) {
    audio.attr('src', staticProxy + audio.attr('src')).attr('controls', 'true');
    return $.html(audio);
  }
  return '';
}

function getLinkPreview($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  const link = $(item).find('.tgme_widget_message_link_preview');
  if (!link?.length) {
    return '';
  }

  const href = link.attr('href') ?? '';
  if (!href) {
    return '';
  }

  const rawTitle = $(item).find('.link_preview_title')?.text() || $(item).find('.link_preview_site_name')?.text() || href;
  const rawDescription = $(item).find('.link_preview_description')?.text() || '';
  const rawSiteName = $(item).find('.link_preview_site_name')?.text() || '';

  const cleanedDescription = rawDescription.replace(/\s+/g, ' ').trim();
  const shortDescription = cleanedDescription ? truncateText(cleanedDescription, 160) : '';

  let domain = '';
  try {
    const resolvedHref = href.startsWith('//') ? `https:${href}` : href;
    domain = new URL(resolvedHref).hostname.replace(/^www\./, '');
  } catch {
    domain = '';
  }
  const metaText = rawSiteName || domain || href;

  const image = $(item).find('.link_preview_image');
  const src = image?.attr('style')?.match(/url\(["'](.*?)["']/i)?.[1];
  const imageSrc = src ? staticProxy + src : '';

  const imageMarkup = imageSrc
    ? `<span class="bookmark-card__media"><img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(rawTitle)}" loading="${(index ?? 0) > 15 ? 'eager' : 'lazy'}" /></span>`
    : '';
  const descriptionMarkup = shortDescription
    ? `<span class="bookmark-card__description">${escapeHtml(shortDescription)}</span>`
    : '';
  const metaMarkup = metaText ? `<span class="bookmark-card__meta">${escapeHtml(metaText)}</span>` : '';

  return `
    <a class="bookmark-card" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
      ${imageMarkup}
      <span class="bookmark-card__content">
        <span class="bookmark-card__title">${escapeHtml(rawTitle)}</span>
        ${descriptionMarkup}
        ${metaMarkup}
      </span>
    </a>
  `;
}

function getForwardedFrom($: CheerioAPI, item: Element): ForwardedFrom | null {
  const forwarded = $(item).find('.tgme_widget_message_forwarded_from').first();
  if (!forwarded.length) {
    return null;
  }

  const nameEl = forwarded.find('.tgme_widget_message_forwarded_from_name').first();
  const name = nameEl.text().replace(/\s+/g, ' ').trim();
  const href = nameEl.attr('href') ?? '';
  const author = forwarded
    .find('.tgme_widget_message_forwarded_from_author')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();

  let cleanedName = name;
  if (!cleanedName) {
    const fallback = forwarded.text().replace(/\s+/g, ' ').trim();
    cleanedName = fallback.replace(/^Forwarded from/i, '').trim();
  }

  if (!cleanedName) {
    return null;
  }

  return {
    name: cleanedName,
    href: href || undefined,
    author: author || undefined,
  };
}

const normalizeReplyAuthor = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().replace(/^@/, '').toLowerCase();

const shouldHideReplyAuthor = (value: string, channel?: string, channelTitle?: string): boolean => {
  const normalized = normalizeReplyAuthor(value);
  if (!normalized) return false;
  const channelNormalized = normalizeReplyAuthor(channel ?? '');
  const titleNormalized = normalizeReplyAuthor(channelTitle ?? '');
  return (
    (channelNormalized && normalized === channelNormalized) ||
    (titleNormalized && normalized === titleNormalized)
  );
};

function getReply(
  $: CheerioAPI,
  item: Element,
  { channel, channelTitle }: ContentProcessorConfig
): string {
  const reply = $(item).find('.tgme_widget_message_reply');
  const authorSelectors = [
    '.tgme_widget_message_reply_author',
    '.tgme_widget_message_reply_title',
    '.tgme_widget_message_reply_name',
  ];

  authorSelectors.forEach((selector) => {
    const authorEl = reply.find(selector).first();
    if (!authorEl.length) return;
    const authorText = authorEl.text().replace(/\s+/g, ' ').trim();
    if (shouldHideReplyAuthor(authorText, channel, channelTitle)) {
      authorEl.remove();
    }
  });
  reply?.wrapInner('<small></small>')?.wrapInner('<blockquote></blockquote>');

  const href = reply?.attr('href');
  if (href && channel) {
    const url = new URL(href);
    reply?.attr('href', `${url.pathname}`.replace(new RegExp(`/${channel}/`, 'i'), '/mood/'));
  }

  return $.html(reply);
}

async function modifyHTMLContent(
  $: CheerioAPI,
  content: any,
  { index, staticProxy }: { index?: number; staticProxy?: string } = {}
): Promise<any> {
  await hydrateTgEmoji($, content, { staticProxy });
  $(content).find('.emoji')?.removeAttr('style');
  $(content)
    .find('a')
    ?.each((_index, a) => {
      $(a)?.attr('title', $(a)?.text())?.removeAttr('onclick');
    });
  $(content)
    .find('tg-spoiler')
    ?.each((_index, spoiler) => {
      const id = `spoiler-${index}-${_index}`;
      $(spoiler)
        ?.attr('id', id)
        ?.wrap('<label class="spoiler-button"></label>')
        ?.before(`<input type="checkbox" />`);
    });
  $(content)
    .find('pre')
    .each((_index, pre) => {
      try {
        $(pre).find('br')?.replaceWith('\n');

        const code = $(pre).text();
        const language = (flourite(code, { shiki: true, noUnknown: true }) as any)?.language || 'text';
        const highlightedCode = Prism.highlight(code, Prism.languages[language] || Prism.languages.text, language);
        $(pre).html(`<code class="language-${language}">${highlightedCode}</code>`);
      } catch (error) {
        console.error(error);
      }
    });
  return content;
}

// Normalize emoji variants (e.g., ❤ → ❤️)
function normalizeEmoji(emoji: string): string {
  const emojiMap: Record<string, string> = {
    '❤': '❤️',
    '☺': '☺️',
    '☹': '☹️',
    '♥': '❤️',
  };
  return emojiMap[emoji] || emoji;
}

async function getCustomEmojiImage(emojiId: string, staticProxy = ''): Promise<string | null> {
  if (!emojiId) return null;
  const imageUrl = `https://t.me/i/emoji/${emojiId}.webp`;
  const proxy = staticProxy || '/static/';
  return `${proxy}${imageUrl}`;
}

async function hydrateTgEmoji(
  $: CheerioAPI,
  content: any,
  { staticProxy }: { staticProxy?: string } = {}
): Promise<void> {
  const emojiNodes = $(content).find('tg-emoji')?.toArray() ?? [];
  if (!emojiNodes.length) return;

  await Promise.all(
    emojiNodes.map(async (emojiEl) => {
      const emojiId = $(emojiEl).attr('emoji-id');
      const fallbackText = ($(emojiEl).text() ?? '').trim();
      if (!emojiId && !fallbackText) return;

      const imageUrl = emojiId ? await getCustomEmojiImage(emojiId, staticProxy ?? '') : null;
      const safeFallback = fallbackText ? escapeHtml(fallbackText) : '';
      const altText = escapeHtml(fallbackText || 'emoji');
      const dataAttr = emojiId ? ` data-emoji-id="${emojiId}"` : '';
      const labelAttr = fallbackText ? ` aria-label="${safeFallback}"` : '';
      const fallbackMarkup = imageUrl
        ? `<img class="tg-emoji-fallback" src="${imageUrl}" alt="${altText}" loading="lazy" />`
        : safeFallback;
      const wrapper = `<span class="tg-emoji"${dataAttr}${labelAttr}>${fallbackMarkup}</span>`;
      $(emojiEl).replaceWith(wrapper);
    })
  );
}

/**
 * Extract comments count from post embed
 */
async function getCommentsCount(
  $: CheerioAPI,
  item: Element,
  {
    channel,
    host = 't.me',
    headers = {},
    postId,
  }: { channel?: string; host?: string; headers?: Record<string, string>; postId?: string } = {}
): Promise<number> {
  // Telegram shows replies/comments in .tgme_widget_message_replies or similar elements
  const repliesEl = $(item).find('.tgme_widget_message_replies, .tgme_widget_message_comments');
  if (repliesEl.length) {
    // Try to extract count from the text content (e.g., "12 comments", "3 replies")
    const text = repliesEl.text().trim();
    const match = text.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    // Fallback: check data attributes
    const dataCount = repliesEl.attr('data-count') || repliesEl.attr('data-replies');
    if (dataCount) {
      const parsed = parseInt(dataCount, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  if (!channel || !postId) return 0;

  const cacheKey = `${channel}/${postId}`;
  const cached = commentsCountCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const url = `https://${host}/${channel}/${postId}?embed=1&discussion=1&comments_limit=1`;
    const html = await $fetch<string>(url, {
      headers,
      retry: 2,
      retryDelay: 100,
    });
    const $discussion = cheerio.load(html, {}, false);
    const headerText =
      $discussion('.tgme_post_discussion_header .js-header').first().text().trim();
    const match = headerText.match(/(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;
    commentsCountCache.set(cacheKey, count);
    return count;
  } catch (error) {
    console.error('Failed to fetch comments count:', error);
    return 0;
  }
}

async function getReactions($: CheerioAPI, item: Element, staticProxy: string): Promise<Reaction[]> {
  const reactions: Reaction[] = [];
  const reactionNodes = $(item).find('.tgme_widget_message_reactions .tgme_reaction').toArray();

  for (const reaction of reactionNodes) {
    const isPaid = $(reaction).hasClass('tgme_reaction_paid');
    let emoji = '';
    let emojiId: string | undefined;
    let emojiImage: string | undefined;

    // Check for standard emoji in <i class="emoji"><b>emoji</b></i>
    const standardEmoji = $(reaction).find('.emoji b');
    if (standardEmoji.length) {
      emoji = normalizeEmoji(standardEmoji.text().trim());
    }

    // Check for custom tg-emoji
    const tgEmoji = $(reaction).find('tg-emoji');
    if (tgEmoji.length && !emoji) {
      emojiId = tgEmoji.attr('emoji-id');
      if (emojiId) {
        const imageUrl = await getCustomEmojiImage(emojiId, staticProxy);
        if (imageUrl) {
          emojiImage = imageUrl;
        }
      }
    }

    // For paid reactions, use star emoji
    if (isPaid && !emoji && !emojiImage) {
      emoji = '⭐';
    }

    // Extract count - get text content and remove emoji
    const clone = $(reaction).clone();
    clone.find('.emoji, tg-emoji, i').remove();
    const count = clone.text().trim();

    if (count) {
      reactions.push({
        emoji,
        emojiId,
        emojiImage,
        count,
        isPaid,
      });
    }
  }

  return reactions;
}

async function getPost(
  $: CheerioAPI,
  item: Element | null,
  {
    channel,
    channelTitle,
    staticProxy,
    index = 0,
    host,
    headers,
  }: ContentProcessorConfig & { channel: string }
): Promise<Post> {
  const messageItem = item ? $(item).find('.tgme_widget_message') : $('.tgme_widget_message');
  const content =
    $(messageItem).find('.js-message_reply_text')?.length > 0
      ? await modifyHTMLContent($, $(messageItem).find('.tgme_widget_message_text.js-message_text'), {
          index,
          staticProxy,
        })
      : await modifyHTMLContent($, $(messageItem).find('.tgme_widget_message_text'), { index, staticProxy });
  const title = content?.text()?.match(/^.*?(?=[。\n]|http\S)/g)?.[0] ?? content?.text() ?? '';
  const id = $(messageItem).attr('data-post')?.replace(new RegExp(`${channel}/`, 'i'), '') ?? '';

  const tags =
    $(content)
      .find('a[href^="?q="]')
      ?.each((_index, a) => {
        $(a)?.attr('href', `/mood?tag=${encodeURIComponent($(a)?.text() ?? '')}`);
      })
      ?.map((_index, a) => $(a)?.text()?.replace('#', '') ?? '')
      ?.get() ?? [];
  const forwardedFrom = getForwardedFrom($, messageItem as Element);

  return {
    id,
    title,
    type: $(messageItem).attr('class')?.includes('service_message') ? 'service' : 'text',
    datetime: $(messageItem).find('.tgme_widget_message_date time')?.attr('datetime') ?? '',
    tags,
    text: content?.text() ?? '',
    content: [
      getReply($, messageItem as Element, { channel, channelTitle, staticProxy }),
      getImages($, messageItem as Element, { staticProxy, id, index, title }),
      getVideo($, messageItem as Element, { staticProxy, index }),
      getAudio($, messageItem as Element, { staticProxy }),
      content?.html(),
      getImageStickers($, messageItem as Element, { staticProxy, index }),
      getVideoStickers($, messageItem as Element, { staticProxy, index }),
      $(messageItem).find('.tgme_widget_message_poll')?.html(),
      $.html($(messageItem).find('.tgme_widget_message_document_wrap')),
      $.html($(messageItem).find('.tgme_widget_message_video_player.not_supported')),
      $.html($(messageItem).find('.tgme_widget_message_location_wrap')),
      getLinkPreview($, messageItem as Element, { staticProxy, index }),
    ]
      .filter(Boolean)
      .join('')
      .replace(/(url\(["'])((https?:)?\/\/)/g, (match, p1, p2, _p3) => {
        if (p2 === '//') {
          p2 = 'https://';
        }
        if (p2?.startsWith('t.me')) {
          return match;
        }
        return `${p1}${staticProxy}${p2}`;
      }),
    forwardedFrom: forwardedFrom ?? undefined,
    reactions: await getReactions($, messageItem as Element, staticProxy),
    commentsCount: await getCommentsCount($, messageItem as Element, {
      channel,
      host,
      headers,
      postId: id,
    }),
  };
}

const unnecessaryHeaders = ['host', 'cookie', 'origin', 'referer'];

/**
 * Parse a single comment from Telegram discussion embed
 */
async function parseComment(
  $: CheerioAPI,
  item: Element,
  { staticProxy, channel, channelTitle }: ContentProcessorConfig
): Promise<Comment | null> {
  const messageEl = $(item).find('.tgme_widget_message').first();
  if (!messageEl.length) return null;

  const rawId = messageEl.attr('data-post-id') || messageEl.attr('data-post') || '';
  const id = rawId.split('/').pop() ?? '';
  if (!id) return null;

  // Get author info
  const authorEl = messageEl.find('.tgme_widget_message_author_name').first();
  const author = authorEl.text().replace(/\s+/g, ' ').trim() || 'Anonymous';

  // Get author avatar
  const avatarImg = messageEl.find('.tgme_widget_message_user_photo img').attr('src') ?? '';
  const avatarStyle = messageEl.find('.tgme_widget_message_user_photo').attr('style') ?? '';
  const avatarMatch = avatarStyle.match(/url\(['"]?(.*?)['"]?\)/);
  const rawAvatar = avatarImg || avatarMatch?.[1] || '';
  const authorAvatar = rawAvatar ? toStaticProxyUrl(rawAvatar, staticProxy) : undefined;

  // Get datetime
  const datetime = messageEl.find('.tgme_widget_message_date time').attr('datetime') ?? '';

  const replyEl = messageEl.find('.tgme_widget_message_reply').first();
  if (replyEl.length) {
    await modifyHTMLContent($, replyEl, { staticProxy });
  }
  const replyHtml = getReply($, messageEl.get(0) as Element, { channel, channelTitle, staticProxy });

  // Get content (prefer actual message text over reply preview)
  let contentEl = messageEl.find('.tgme_widget_message_text.js-message_text').first();
  if (!contentEl.length) {
    contentEl = messageEl
      .find('.tgme_widget_message_text')
      .filter((_index, el) => {
        const element = $(el);
        return (
          !element.hasClass('js-message_reply_text') &&
          !element.closest('.tgme_widget_message_reply').length &&
          !element.closest('.tgme_widget_message_reply_template').length
        );
      })
      .first();
  }
  await modifyHTMLContent($, contentEl, { staticProxy });

  // Extract stickers from comments (same as posts)
  const stickersHtml = [
    getImageStickers($, messageEl.get(0) as Element, { staticProxy }),
    getVideoStickers($, messageEl.get(0) as Element, { staticProxy }),
  ].filter(Boolean).join('');

  const content = [replyHtml, contentEl.html() ?? '', stickersHtml].filter(Boolean).join('');

  // Get reactions
  const reactions = await getReactions($, messageEl.get(0) as Element, staticProxy);

  return {
    id,
    author,
    authorAvatar,
    datetime,
    content,
    reactions,
  };
}

/**
 * Fetch comments for a specific post from Telegram discussion
 */
export async function getPostComments(
  Astro: any,
  { postId, before = '' }: { postId: string; before?: string }
): Promise<{ comments: Comment[]; hasMore: boolean; nextBefore?: string }> {
  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') || 't.me';
  const channel = getEnv(import.meta.env, Astro, 'CHANNEL');
  const staticProxy = '/static/';

  // Telegram exposes comments via the discussion embed endpoint
  const url = `https://${host}/${channel}/${postId}?embed=1&discussion=1&comments_limit=20`;
  const headers = Object.fromEntries(Astro.request.headers);

  Object.keys(headers).forEach((key) => {
    if (unnecessaryHeaders.includes(key)) {
      delete headers[key];
    }
  });

  try {
    console.info('Fetching comments', url, { postId, before });
    const html = await $fetch<string>(url, {
      headers,
      query: before ? { before } : undefined,
      retry: 2,
      retryDelay: 100,
    });

    const $ = cheerio.load(html, {}, false);

    // Find all comment messages in the discussion
    const commentNodes = $('.tgme_widget_message_wrap').toArray();
    const comments: Comment[] = [];

    for (const node of commentNodes) {
      const comment = await parseComment($, node, { staticProxy, channel });
      if (comment) {
        comments.push(comment);
      }
    }

    // Check if there are more comments (pagination)
    const moreEl = $('.tgme_widget_message_more').first();
    const hasMore = moreEl.length > 0;
    let nextBefore = '';

    if (hasMore) {
      const dataBefore = moreEl.attr('data-before') ?? '';
      const href = moreEl.attr('href') ?? '';
      nextBefore = dataBefore;

      if (!nextBefore && href) {
        try {
          const parsed = new URL(href, `https://${host}`);
          nextBefore = parsed.searchParams.get('before') ?? '';
        } catch {
          const match = href.match(/before=(\d+)/);
          nextBefore = match?.[1] ?? '';
        }
      }
    }

    return { comments, hasMore, nextBefore };
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return { comments: [], hasMore: false, nextBefore: '' };
  }
}

export async function getChannelInfo(
  Astro: any,
  { before = '', after = '', q = '', type = 'list', id = '' }: { before?: string; after?: string; q?: string; type?: string; id?: string } = {}
): Promise<ChannelInfo | Post> {
  const cacheKey = JSON.stringify({ before, after, q, type, id });
  const cachedResult = cache.get(cacheKey);

  if (cachedResult) {
    console.info('Match Cache', { before, after, q, type, id });
    return JSON.parse(JSON.stringify(cachedResult));
  }

  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') || 't.me';
  const channel = getEnv(import.meta.env, Astro, 'CHANNEL');
  // Always use local static proxy for Telegram media
  const staticProxy = '/static/';

  const url = id ? `https://${host}/${channel}/${id}?embed=1&mode=tme` : `https://${host}/s/${channel}`;
  const headers = Object.fromEntries(Astro.request.headers);

  Object.keys(headers).forEach((key) => {
    if (unnecessaryHeaders.includes(key)) {
      delete headers[key];
    }
  });

  console.info('Fetching', url, { before, after, q, type, id });
  const html = await $fetch<string>(url, {
    headers,
    query: {
      before: before || undefined,
      after: after || undefined,
      q: q || undefined,
    },
    retry: 3,
    retryDelay: 100,
  });

  const $ = cheerio.load(html, {}, false);
  const channelTitle = $('.tgme_channel_info_header_title')?.text() ?? '';
  if (id) {
    const post = await getPost($, null, { channel, channelTitle, staticProxy, host, headers });
    cache.set(cacheKey, post);
    return post;
  }
  const posts =
    (await Promise.all(
      $('.tgme_channel_history  .tgme_widget_message_wrap')
        ?.map((index, item) => {
          return getPost($, item, { channel, channelTitle, staticProxy, index, host, headers });
        })
        ?.get() ?? []
    ))
      ?.reverse()
      .filter((post: Post) => ['text'].includes(post.type) && post.id && post.content) ?? [];

  const channelInfo: ChannelInfo = {
    posts,
    title: channelTitle,
    titleHTML: (await modifyHTMLContent($, $('.tgme_channel_info_header_title'), { staticProxy }))?.html() ?? '',
    description: $('.tgme_channel_info_description')?.text() ?? '',
    descriptionHTML: (await modifyHTMLContent($, $('.tgme_channel_info_description'), { staticProxy }))?.html() ?? '',
    avatar: $('.tgme_page_photo_image img')?.attr('src') ?? '',
  };

  cache.set(cacheKey, channelInfo);
  return channelInfo;
}
